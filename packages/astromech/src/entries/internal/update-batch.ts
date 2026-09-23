import type { EntryRepository } from '../repository/types';
import type { EntryRecord } from './records';
import type {
    AppContext,
    Entry,
    EntryCreateContext,
    ParsedEntryUpdateData,
    ResolvedConfig,
    ResolvedEntryType,
    User,
} from '@/types/index';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types';
import { CapabilityError } from '@/errors/capability';
import { ResourceNotFoundError } from '@/errors/resource';
import { parseInput } from '@/errors/validation';
import { BulkOperationError, UnknownEntryTypeError } from '../errors';
import { getEntryRepository } from '../repository/registry';
import { createEntrySchema, updateEntrySchema } from '../schema';
import { assertWritableFields } from './entry-type';
import { asEntry, asRecord, findEntryOfType, getEntryOfType } from './records';
import { syncEntryRelationships } from './relationships';
import { deriveSlug, uniqueSlugIfChanged } from './slug';
import { toStoredFields } from './stored-fields';
import { propagateSharedFields } from './translatable';
import { changesVersionedContent, snapshotVersion } from './versions';

/**
 * Updates one locale of a batch of entries, atomically, firing the entry write
 * hooks around it. A single id is a batch of one (`DECISIONS.md`). A locale with
 * no content row yet is created from the default-locale row (unless
 * `createMissingLocale` is false), which is how a translation is written;
 * `staged` writes the staged change instead.
 *
 * Batch-only: `methods/update.ts` and `methods/status.ts` reach it through
 * `fromBatch`, which is what turns one id into a batch of one.
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
    },
    ctx: AppContext
): Promise<Entry[]> {
    const entryType = resolveEntryType(ctx.config, params.type);
    if (!entryType) {
        throw new UnknownEntryTypeError(params.type);
    }

    assertWritableFields(entryType, params.data);

    // A single slug across many ids would violate (type, locale) uniqueness.
    if (params.ids.length > 1 && params.data.slug !== undefined) {
        throw new Error(
            'Bulk update cannot set `slug`: a single value across multiple ids ' +
                'would violate (type, locale) slug uniqueness. Update slugs individually.'
        );
    }

    const locale = resolveResourceLocale(
        RESOURCE_SPECS.entry,
        ctx.config,
        entryType.id,
        params.locale
    );

    const repository = getEntryRepository(entryType.id);
    const user = ctx.user;

    // Each id is read once, at the top: the record feeds both the before-hook
    // context and the write, so nothing loads twice. An id with no row in this
    // locale becomes a translation, planned here for the same reason.
    const staging = params.staged === true ? repository.staging : undefined;
    if (params.staged === true && !staging) {
        throw new CapabilityError('entry', entryType.id, 'staging');
    }

    const plans: UpdatePlan[] = [];
    for (const id of params.ids) {
        const record = staging
            ? await getStagedRecord(staging, id, locale)
            : await findEntryOfType(ctx.config, repository, entryType.id, id, locale);
        if (!record && params.createMissingLocale === false) {
            throw new ResourceNotFoundError('entry', { id, locale });
        }
        plans.push(
            record
                ? { kind: 'update', id, record }
                : {
                      kind: 'translate',
                      id,
                      write: await planTranslation({
                          config: ctx.config,
                          repository,
                          entryType,
                          id,
                          locale,
                          data: params.data,
                          user,
                      }),
                  }
        );
    }

    for (const plan of plans) {
        if (plan.kind === 'update') {
            await ctx.runHook('entry:beforeUpdate', {
                type: entryType.id,
                entry: asEntry(plan.record),
                data: params.data,
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

    const results = await transaction(async () => {
        const out: Entry[] = [];
        const succeeded: string[] = [];
        for (const plan of plans) {
            try {
                out.push(
                    plan.kind === 'update'
                        ? await updateOne({
                              config: ctx.config,
                              repository,
                              entryType,
                              currentEntry: plan.record,
                              data: params.data,
                              user,
                              staging,
                          })
                        : await writeTranslation({
                              config: ctx.config,
                              repository,
                              type: entryType.id,
                              id: plan.id,
                              locale,
                              write: plan.write,
                          })
                );
                succeeded.push(plan.id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: plan.id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
        return out;
    });

    for (const [index, plan] of plans.entries()) {
        // A throw here propagates; the write above stays (`DECISIONS.md`).
        if (plan.kind === 'update') {
            await ctx.runHook('entry:afterUpdate', {
                type: entryType.id,
                entry: asEntry(plan.record),
                data: params.data,
                user,
            });
        } else {
            await ctx.runHook('entry:afterCreate', {
                type: entryType.id,
                data: plan.write,
                user,
                entry: results[index] as Entry,
            });
        }
    }

    return results;
}

/** The row a new translation writes — `create`'s row, for the same hooks. */
type TranslationWrite = EntryCreateContext['data'] & {
    createdBy: string | null;
    updatedBy: string | null;
};

/** What one id in the batch turns out to be: an edit, or a new translation. */
type UpdatePlan =
    | { kind: 'update'; id: string; record: EntryRecord }
    | { kind: 'translate'; id: string; write: TranslationWrite };

/**
 * Updates one entry: validates the patch, versions the state it replaces,
 * writes the row, then re-indexes relationships and propagates shared fields.
 */
async function updateOne(params: {
    config: ResolvedConfig;
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    currentEntry: EntryRecord;
    data: ParsedEntryUpdateData;
    user: User | null;
    /** Present when the write targets the staged change rather than the canonical. */
    staging: NonNullable<EntryRepository['staging']> | undefined;
}): Promise<Entry> {
    const { config, repository, entryType, currentEntry, data, user, staging } = params;

    const titled = entryType.titleField !== false;
    const validated = parseInput(updateEntrySchema({ titled }), data);

    const patch = validated.fields;
    const patchedFieldNames = patch ? getPatchedFieldNames(patch) : [];
    const fields = patch
        ? await toStoredFields({
              kind: 'update',
              config,
              repository,
              entryType,
              currentEntry,
              patch,
              patchedFieldNames,
              status: validated.status,
              user,
          })
        : undefined;

    // Snapshot before the slug is uniquified, so the version compares what the caller sent.
    if (
        entryType.capabilities.versioning &&
        repository.versions &&
        changesVersionedContent(currentEntry, {
            title: validated.title,
            slug: validated.slug,
            fields,
        })
    ) {
        await snapshotVersion(repository.versions, currentEntry, user);
    }

    const publishedAt =
        validated.status === 'published' && !currentEntry.publishedAt
            ? new Date()
            : validated.publishedAt;
    const slug = await uniqueSlugIfChanged({
        repository,
        type: entryType.id,
        entry: currentEntry,
        slug: validated.slug,
    });

    const ref = { id: currentEntry.id, locale: currentEntry.locale };
    const write = {
        title: validated.title,
        slug,
        fields,
        status: validated.status,
        publishedAt,
        // Moves with `updatedAt`, not with the version snapshot. A publish is a
        // write to the row, so it stamps; whether it also takes a version is
        // `changesVersionedContent`'s separate question.
        updatedBy: user?.id ?? null,
    };

    const entry = asEntry(
        staging ? await staging.update(ref, write) : await repository.update(ref, write)
    );
    if (fields) {
        await syncEntryRelationships(config, entry, fields, entryType.id);
        // A staged row is not one of the entry's locales, so its shared fields
        // stay with it until the merge.
        if (!staging) {
            await propagateSharedFields({
                repository,
                entryType,
                entry: currentEntry,
                fields,
                patchedFieldNames,
            });
        }
    }
    return entry;
}

/**
 * The row a missing locale gets: the default-locale row's columns with the
 * caller's patch over them, its shared fields inherited, and `create`'s
 * validation applied to the result. Throws when the entry itself is absent.
 */
async function planTranslation(params: {
    config: ResolvedConfig;
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    id: string;
    locale: string;
    data: ParsedEntryUpdateData;
    user: User | null;
}): Promise<TranslationWrite> {
    const { config, repository, entryType, id, locale, data, user } = params;
    const source = await getEntryOfType(config, repository, entryType.id, id);

    const titled = entryType.titleField !== false;
    const validated = parseInput(createEntrySchema({ titled }), {
        title: data.title ?? source.title,
        slug: data.slug ?? source.slug ?? undefined,
        fields: data.fields,
        status: data.status ?? source.status,
        publishedAt: data.publishedAt ?? source.publishedAt,
    });

    const title = validated.title ?? '';
    const status = validated.status ?? 'unpublished';
    const slug = await deriveSlug({
        repository,
        entryType,
        locale,
        title,
        slug: validated.slug,
    });

    const fields = await toStoredFields({
        kind: 'create',
        config,
        repository,
        entryType,
        values: validated.fields ?? {},
        locale,
        entryId: id,
        status,
        user,
    });

    return {
        title,
        slug,
        locale,
        fields,
        status,
        publishedAt:
            status === 'published' ? new Date() : (validated.publishedAt ?? null),
        createdBy: user?.id ?? null,
        updatedBy: user?.id ?? null,
    };
}

/** Write the planned translation and fold its references into the entry's index. */
async function writeTranslation(params: {
    config: ResolvedConfig;
    repository: EntryRepository;
    type: string;
    id: string;
    locale: string;
    write: TranslationWrite;
}): Promise<Entry> {
    const { config, repository, type, id, locale, write } = params;
    const entry = asEntry(await repository.update({ id, locale }, write));
    await syncEntryRelationships(config, entry, write.fields, type);
    return entry;
}

/** The staged change for one locale, which a staged write requires to exist. */
async function getStagedRecord(
    staging: NonNullable<EntryRepository['staging']>,
    id: string,
    locale: string
): Promise<EntryRecord> {
    const row = await staging.getByCanonical(id, locale);
    if (!row) throw new Error(`No staged change for entry '${id}'`);
    return asRecord(row);
}

/** Root field names the caller actually sent; an `undefined` value is absent. */
function getPatchedFieldNames(patch: Record<string, unknown>): string[] {
    return Object.keys(patch).filter((name) => patch[name] !== undefined);
}
