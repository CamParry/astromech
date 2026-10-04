import type { EntryResource } from '../repository/types';
import type { EntryRowWrite } from './prepare-row';
import type { ContentRowId } from '@/content/repository/types';
import type { WriteGuard } from '@/content/write-guard';
import type {
    AppContext,
    EntryStatus,
    JsonObject,
    ParsedEntryUpdateData,
    ResolvedConfig,
    ResolvedEntryType,
    User,
} from '@/types/index';
import { resolveResourceLocale } from '@/content/locale';
import { patchedFieldNames } from '@/content/prepare-fields';
import { resolvePublishedAt } from '@/content/published-at';
import { requireStagedChange } from '@/content/staging';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { assertGuardHolds, writeGuarded } from '@/content/write-guard';
import { resolveEntryType } from '@/entries/entry-types';
import { ResourceNotFoundError } from '@/errors/resource';
import { parseInput } from '@/errors/validation';
import { parseHookOutput, parseOutput } from '@/services/parse-method-output';
import { assertWritableFields } from '../capabilities';
import { UnknownEntryTypeError } from '../errors';
import { getEntryOfType } from '../read-entry';
import { syncEntryRelationships } from '../relationships';
import { entryRepository } from '../repository/entries-table';
import { entrySchema, updateEntrySchema } from '../schema';
import { entryValidationMode } from '../validation-mode';
import { prepareEntryFields } from './prepare-fields';
import { prepareEntryRow } from './prepare-row';
import { uniqueSlugIfChanged } from './slug';
import { writeBatch } from './write-batch';

/**
 * Writes one locale of each entry in a batch, atomically, firing the write hooks,
 * for `update`, the status methods and `restore`. A locale with no row is created
 * unless `createMissingLocale` is false; `staged` writes the staged change.
 */
export async function updateEntryBatch(
    params: {
        type: string;
        ids: readonly string[];
        locale?: string | undefined;
        /** Write each entry's staged change for this locale instead of its canonical row. */
        staged?: boolean | undefined;
        /**
         * Write a locale with no content row yet, creating it. Only `update` sets
         * it: a status change addresses a row that must already exist.
         */
        createMissingLocale?: boolean | undefined;
        /** The patch, as `entries.update` parsed it. */
        data: ParsedEntryUpdateData;
        /**
         * Whether each entry must be live (the default) or still in the trash,
         * which only `restore` writes to. Checked at load and again in the write.
         */
        trash?: 'live' | 'trashed' | undefined;
        /**
         * The scheduled-publish job's condition: each row must still be scheduled
         * for this time. Checked at load and again in the write.
         */
        scheduledFor?: Date | undefined;
    },
    ctx: AppContext
): Promise<EntryResource[]> {
    const { type, ids } = params;
    const { config, user } = ctx;
    const staged = params.staged === true;
    const trash = params.trash ?? 'live';
    const { scheduledFor } = params;
    const entryType = resolveEntryType(config, type);
    if (!entryType) throw new UnknownEntryTypeError(type);
    const schema = updateEntrySchema({ titled: entryType.titleField !== false });

    // Parsed before a hook sees it, so a failure here is the caller's 422.
    const data = parseInput(schema, params.data);
    assertWritableFields(entryType, data);
    if (ids.length > 1 && data.slug !== undefined) {
        throw new Error(
            'Bulk update cannot set `slug`: a single value across multiple ids ' +
                'would violate (type, locale) slug uniqueness. Update slugs individually.'
        );
    }
    const locale = resolveResourceLocale('entry', config, entryType.id, params.locale);

    // An id with no row in `locale` is a new translation, prepared here so its
    // before hook sees the row it writes, as `create`'s does.
    const plans: UpdatePlan[] = [];
    for (const id of ids) {
        const record = staged
            ? await getStagedRecord(id, locale)
            : await entryRepository.findOne(
                  { type: entryType.id, id, locale },
                  { includeTrashed: true }
              );
        if (!record && params.createMissingLocale === false) {
            throw new ResourceNotFoundError('entry', { id, locale });
        }
        // A new translation is checked against the row it copies.
        const source = record ?? (await getEntryOfType(entryType.id, id));
        assertGuardHolds(
            'entry',
            { canonical: source },
            { contentId: source.contentId, trash, scheduledFor },
            { id, locale }
        );
        plans.push(
            record
                ? { kind: 'update', id, record }
                : {
                      kind: 'translate',
                      id,
                      sourceContentId: source.contentId,
                      write: await planTranslation({
                          config,
                          entryType,
                          source,
                          locale,
                          data,
                          user,
                      }),
                  }
        );
    }

    // An update's fields are prepared after its hook, in `updateOne`: the hook
    // may change `data` in place, so it is parsed again as the hooks leave it.
    for (const plan of plans) {
        if (plan.kind === 'update') {
            await ctx.runHook('entry:beforeUpdate', {
                type: entryType.id,
                entry: parseOutput(
                    entrySchema,
                    plan.record,
                    'The entry in entry:beforeUpdate'
                ),
                data,
                user,
            });
        } else {
            await ctx.runHook('entry:beforeCreate', {
                type: entryType.id,
                data: plan.write,
                user,
            });
        }
    }
    const written = parseHookOutput(schema, data, 'entry:beforeUpdate');

    const results = await writeBatch(plans, (plan) =>
        plan.kind === 'update'
            ? updateOne({
                  config,
                  entryType,
                  currentEntry: plan.record,
                  data: written,
                  user,
                  staged,
                  guard: { trash, scheduledFor },
              })
            : writeTranslation({
                  config,
                  type: entryType.id,
                  id: plan.id,
                  locale,
                  write: plan.write,
                  guard: { contentId: plan.sourceContentId, trash },
              })
    );

    for (const [index, plan] of plans.entries()) {
        // A throw here propagates; the write above stays (`DECISIONS.md`).
        if (plan.kind === 'update') {
            await ctx.runHook('entry:afterUpdate', {
                type: entryType.id,
                entry: parseOutput(
                    entrySchema,
                    plan.record,
                    'The entry in entry:afterUpdate'
                ),
                data: written,
                user,
            });
        } else {
            await ctx.runHook('entry:afterCreate', {
                type: entryType.id,
                data: plan.write,
                user,
                entry: parseOutput(
                    entrySchema,
                    results[index],
                    'The entry in entry:afterCreate'
                ),
            });
        }
    }

    return results;
}

/** What one id in the batch turns out to be: an edit, or a new translation. */
type UpdatePlan =
    | { kind: 'update'; id: string; record: EntryResource }
    | {
          kind: 'translate';
          id: string;
          /** The row the translation was checked against and is copied from. */
          sourceContentId: ContentRowId;
          write: EntryRowWrite;
      };

/**
 * Updates one entry with a parsed patch: saves the state it replaces as a
 * version, writes the row, then re-indexes it and propagates shared fields.
 */
async function updateOne(params: {
    config: ResolvedConfig;
    entryType: ResolvedEntryType;
    currentEntry: EntryResource;
    data: ParsedEntryUpdateData;
    user: User | null;
    /** True when the write targets the staged change rather than the canonical. */
    staged: boolean;
    /** The conditions the snapshot and the write carry, beyond the row. */
    guard: Omit<WriteGuard, 'contentId'>;
}): Promise<EntryResource> {
    const { config, entryType, currentEntry, data, user, staged } = params;

    const fields = await fieldsToStore({ config, entryType, currentEntry, data, user });
    const patchedNames = data.fields ? patchedFieldNames(data.fields) : [];
    const ref = { id: currentEntry.id, locale: currentEntry.locale };
    const address = { ...ref, staged };
    const guard = { ...params.guard, contentId: currentEntry.contentId };

    // Decided before the slug is uniquified, so the version compares what the caller sent.
    if (
        entryType.capabilities.versioning &&
        changesVersionedContent('entry', currentEntry, {
            title: data.title,
            slug: data.slug,
            fields,
        })
    ) {
        await snapshotVersion('entry', entryRepository, guard, user, address);
    }

    const publishedAt = resolvePublishedAt({
        status: data.status,
        given: data.publishedAt,
        current: currentEntry,
        now: new Date(),
    });
    const slug = await uniqueSlugIfChanged({
        type: entryType.id,
        entry: currentEntry,
        slug: data.slug,
    });
    const write = {
        title: data.title,
        slug,
        fields,
        status: data.status,
        publishedAt,
        updatedBy: user?.id ?? null,
    };

    const entry = await writeGuarded({
        kind: 'entry',
        address,
        guard,
        repository: entryRepository,
        write: () =>
            staged
                ? entryRepository.staging.update(ref, write, guard)
                : entryRepository.update(ref, write, guard),
    });
    if (!staged && slug !== undefined && slug !== currentEntry.slug) {
        await entryRepository.updateStagedSlug(ref, {
            from: currentEntry.slug,
            to: slug,
        });
    }
    if (fields) {
        await syncEntryRelationships(config, entry, entryType.id);
        // A staged row is not one of the entry's locales, so its shared fields
        // stay with it until the merge.
        if (!staged) {
            await propagateSharedFields('entry', config, {
                target: entryType.id,
                translatable: entryRepository.translatable,
                record: currentEntry,
                fields,
                patchedFieldNames: patchedNames,
            });
        }
    }

    return entry;
}

/**
 * The fields an update stores, or undefined to leave them as they are. A write
 * with no fields patch rewrites nothing, but one that moves the entry to a
 * complete status still checks the stored fields in complete mode.
 */
async function fieldsToStore(params: {
    config: ResolvedConfig;
    entryType: ResolvedEntryType;
    currentEntry: EntryResource;
    data: ParsedEntryUpdateData;
    user: User | null;
}): Promise<JsonObject | undefined> {
    const { config, entryType, currentEntry, data, user } = params;
    const write = { kind: 'update', config, entryType, currentEntry, user } as const;

    if (data.fields) {
        return prepareEntryFields({ ...write, patch: data.fields, status: data.status });
    }
    // The parse throws the 422; its values are not written.
    if (completes(entryType, data.status)) {
        await prepareEntryFields({ ...write, patch: {}, status: data.status });
    }
    return undefined;
}

/** True when the write sets a status the fields must be complete for. */
function completes(
    entryType: ResolvedEntryType,
    status: EntryStatus | undefined
): boolean {
    return (
        status !== undefined &&
        entryValidationMode({ status, hasStatuses: entryType.capabilities.statuses }) ===
            'complete'
    );
}

/**
 * The row a missing locale gets: the default-locale row's title and slug with the
 * caller's patch over them, prepared as `create` prepares a row, so it starts
 * `unpublished` with no date unless the patch names them.
 */
async function planTranslation(params: {
    config: ResolvedConfig;
    entryType: ResolvedEntryType;
    /** The entry's default-locale row. */
    source: EntryResource;
    locale: string;
    data: ParsedEntryUpdateData;
    user: User | null;
}): Promise<EntryRowWrite> {
    const { config, entryType, source, locale, data, user } = params;

    return prepareEntryRow({
        config,
        entryType,
        locale,
        entryId: source.id,
        data: {
            title: data.title ?? source.title,
            slug: data.slug ?? source.slug ?? undefined,
            fields: data.fields,
            status: data.status,
            publishedAt: data.publishedAt,
        },
        // A new locale is a new row: it has no publication of its own to keep.
        current: null,
        user,
    });
}

/**
 * Writes the planned translation while the row it was checked against holds the
 * guard, and folds its references into the entry's index.
 */
async function writeTranslation(params: {
    config: ResolvedConfig;
    type: string;
    id: string;
    locale: string;
    write: EntryRowWrite;
    guard: WriteGuard;
}): Promise<EntryResource> {
    const { config, type, id, locale, write, guard } = params;
    const entry = await writeGuarded({
        kind: 'entry',
        address: { id, locale },
        guard,
        repository: entryRepository,
        write: () => entryRepository.translatable.create({ id, locale }, write, guard),
    });
    await syncEntryRelationships(config, entry, type);
    return entry;
}

/** The staged change for one locale, which a staged write requires to exist. */
async function getStagedRecord(id: string, locale: string): Promise<EntryResource> {
    return requireStagedChange(entryRepository.staging, 'entry', {
        rowId: id,
        id,
        locale,
    });
}
