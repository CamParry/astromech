import type { EntryResource } from '../repository/types';
import type { ParsedEntryUpdateData } from '../service-types';
import type { EntryRowWrite } from './prepare-row';
import type { ContentRowId } from '@/content/repository/types';
import type { WriteGuard } from '@/content/write-guard';
import type { EntryDraftRow } from '@/entries/tables';
import type {
    AppContext,
    EntryStatus,
    JsonObject,
    ResolvedConfig,
    ResolvedEntryType,
    User,
} from '@/types/index';
import { draftSavedAt, keepsDrafts, writesDraft } from '@/content/drafts';
import { resolveResourceLocale } from '@/content/locale';
import { patchedFieldNames } from '@/content/prepare-fields';
import { resolvePublishedAt } from '@/content/published-at';
import { requireStagedChange } from '@/content/staging';
import { propagateSharedFields } from '@/content/translatable';
import { resolveValidationMode } from '@/content/validation-mode';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { assertGuardHolds, writeGuarded } from '@/content/write-guard';
import { resolveEntryType } from '@/entries/entry-types';
import { ResourceNotFoundError, ResourceValidationError } from '@/errors/resource';
import { parseInput } from '@/errors/validation';
import { parseHookOutput, parseOutput } from '@/services/parse-method-output';
import { assertWritableFields } from '../capabilities';
import { UnknownEntryTypeError } from '../errors';
import { getEntryOfType } from '../read-entry';
import { syncEntryRelationships } from '../relationships';
import { entryDraftRepository, entryRepository } from '../repository/entries-table';
import { entrySchema, updateEntrySchema } from '../schema';
import { foldDraft, withDraft } from './drafts';
import { prepareEntryFields } from './prepare-fields';
import { prepareEntryRow } from './prepare-row';
import { assertSlugFree, uniqueSlugIfChanged } from './slug';
import { writeBatch } from './write-batch';

/**
 * Writes one locale of each entry in a batch, atomically, firing the write hooks,
 * for `update`, the status methods and `restore`. A locale with no row is created
 * unless `createMissingLocale` is false; `staged` writes the staged change.
 *
 * On a type that keeps drafts (`keepsDrafts`), a content-only write to a
 * published locale saves the locale's draft instead, with no hooks and no
 * version. A write naming `status` or `publishedAt` there writes the live row
 * with the draft folded in under its patch, and deletes the draft: that is how
 * `publish` publishes a draft, and how `unpublish` keeps its content.
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
    // Refused rather than renamed per id (`same-1`), which would succeed with
    // slugs the caller never sent.
    if (ids.length > 1 && data.slug !== undefined) {
        throw new ResourceValidationError([], {
            slug: [
                'Cannot be set on more than one entry at once: slugs are unique ' +
                    'per type and locale. Update slugs one entry at a time.',
            ],
        });
    }
    const locale = resolveResourceLocale('entry', config, entryType.id, params.locale);
    // A staged write addresses the staged row; drafts never apply to it.
    const drafts = !staged && keepsDrafts(entryType.capabilities);

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
                ? await planEdit({ id, record, data, drafts })
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
    // A draft save fires no hook; `*Draft` events are planned
    // (`roadmap/planned/hooks.md`).
    for (const plan of plans) {
        if (plan.kind === 'update') {
            await ctx.runHook('entry:beforeUpdate', {
                type: entryType.id,
                entry: parseOutput(
                    entrySchema,
                    plan.record,
                    'The entry in entry:beforeUpdate'
                ),
                data: plan.data,
                user,
            });
        } else if (plan.kind === 'translate') {
            await ctx.runHook('entry:beforeCreate', {
                type: entryType.id,
                data: plan.write,
                user,
            });
        }
    }
    const steps = plans.map((plan) => ({
        id: plan.id,
        plan,
        data:
            plan.kind === 'translate'
                ? data
                : parseHookOutput(schema, plan.data, 'entry:beforeUpdate'),
    }));

    const guard = { trash, scheduledFor };
    const results = await writeBatch(steps, ({ plan, data: written }) => {
        switch (plan.kind) {
            case 'update':
                return updateOne({
                    config,
                    entryType,
                    currentEntry: plan.record,
                    draft: plan.draft,
                    data: written,
                    user,
                    staged,
                    guard,
                });
            case 'draft':
                return saveDraft({
                    config,
                    entryType,
                    record: plan.record,
                    draft: plan.draft,
                    data: written,
                    user,
                    guard,
                });
            case 'translate':
                return writeTranslation({
                    config,
                    id: plan.id,
                    locale,
                    write: plan.write,
                    guard: { contentId: plan.sourceContentId, trash },
                });
        }
    });

    for (const [index, { plan, data: written }] of steps.entries()) {
        // A throw here propagates; the write above stays (`decisions/hook-throws-propagate.md`).
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
        } else if (plan.kind === 'translate') {
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

/**
 * What one id in the batch turns out to be: a write to its row, a save of its
 * draft, or a new translation.
 */
type UpdatePlan =
    | {
          kind: 'update';
          id: string;
          record: EntryResource;
          /** The patch, with the draft folded in when there is one. */
          data: ParsedEntryUpdateData;
          /**
           * The locale's draft as read: folded into the write and deleted with
           * it. Null when the locale has none; undefined when the locale takes
           * no draft, so none is read.
           */
          draft: EntryDraftRow | null | undefined;
      }
    | {
          kind: 'draft';
          id: string;
          /** The live row the draft belongs to. */
          record: EntryResource;
          data: ParsedEntryUpdateData;
          /** The draft the save replaces, or null for the first save. */
          draft: EntryDraftRow | null;
      }
    | {
          kind: 'translate';
          id: string;
          /** The row the translation was checked against and is copied from. */
          sourceContentId: ContentRowId;
          write: EntryRowWrite;
      };

/**
 * The plan for a locale that has a row: its draft when the type keeps drafts
 * and the write changes a published locale's content only, else its row,
 * folding in any draft the row has.
 */
async function planEdit(params: {
    id: string;
    record: EntryResource;
    data: ParsedEntryUpdateData;
    /** Whether the type keeps drafts and the write is not a staged one. */
    drafts: boolean;
}): Promise<UpdatePlan> {
    const { id, record, data, drafts } = params;
    if (!drafts || record.status !== 'published') {
        return { kind: 'update', id, record, data, draft: undefined };
    }
    const draft = await entryDraftRepository.findOne(id, record.locale);
    if (writesDraft(record.status, data))
        return { kind: 'draft', id, record, data, draft };
    return {
        kind: 'update',
        id,
        record,
        data: draft ? foldDraft(draft, data) : data,
        draft,
    };
}

/**
 * Updates one entry with a parsed patch: saves the state it replaces as a
 * version, writes the row, then re-indexes it and propagates shared fields.
 * A draft folded into the patch is deleted in the same transaction.
 */
async function updateOne(params: {
    config: ResolvedConfig;
    entryType: ResolvedEntryType;
    currentEntry: EntryResource;
    /** The locale's draft as read, or null for none; undefined when it takes none. */
    draft: EntryDraftRow | null | undefined;
    data: ParsedEntryUpdateData;
    user: User | null;
    /** True when the write targets the staged change rather than the canonical. */
    staged: boolean;
    /** The conditions the snapshot and the write carry, beyond the row. */
    guard: Omit<WriteGuard, 'contentId'>;
}): Promise<EntryResource> {
    const { config, entryType, currentEntry, draft, data, user, staged } = params;

    const fields = await fieldsToStore({ config, entryType, currentEntry, data, user });
    const patchedNames = data.fields ? patchedFieldNames(data.fields) : [];
    const ref = { id: currentEntry.id, locale: currentEntry.locale };
    const address = { ...ref, staged };
    const guard: WriteGuard = {
        ...params.guard,
        contentId: currentEntry.contentId,
        // The draft must be as read, so the fold never publishes or deletes a
        // draft saved after it.
        ...(draft === undefined ? {} : { draft: draft?.updatedAt ?? null }),
    };

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
    const slugChange = { type: entryType.id, entry: currentEntry, slug: data.slug };
    // A draft that goes live keeps the slug its editor chose, or is refused.
    const publishesDraft =
        draft !== null &&
        draft !== undefined &&
        (data.status ?? currentEntry.status) === 'published';
    if (publishesDraft) await assertSlugFree(slugChange);
    const slug = publishesDraft ? data.slug : await uniqueSlugIfChanged(slugChange);
    const write = {
        title: data.title,
        slug,
        fields,
        status: data.status,
        publishedAt,
        updatedBy: user?.id ?? null,
    };

    const entry = await writeGuarded({
        type: 'entry',
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
        // After the propagation: each locale is indexed from its own row, so the
        // other locales' rows must hold the shared fields first.
        await syncEntryRelationships(config, entry);
    }
    if (draft) {
        await entryDraftRepository.delete(ref.id, ref.locale);
        return { ...entry, hasDraft: false };
    }

    return entry;
}

/**
 * Saves a published locale's draft with a parsed patch, merged over the draft
 * it replaces or, for the first save, over the live row. The fields are
 * validated as the live status demands, and the slug is refused when another
 * live entry holds it. Writes no version, re-indexes nothing and propagates no
 * shared field: the live row is unchanged until the draft is published.
 */
async function saveDraft(params: {
    config: ResolvedConfig;
    entryType: ResolvedEntryType;
    record: EntryResource;
    draft: EntryDraftRow | null;
    data: ParsedEntryUpdateData;
    user: User | null;
    guard: Omit<WriteGuard, 'contentId'>;
}): Promise<EntryResource> {
    const { config, entryType, record, draft, data, user } = params;
    const base = draft ? withDraft(record, draft) : record;

    const fields = await fieldsToStore({
        config,
        entryType,
        currentEntry: base,
        data,
        user,
    });
    await assertSlugFree({ type: entryType.id, entry: record, slug: data.slug });
    // The live row must still be published, and the draft as read: a second
    // save from the same read conflicts, as `draftSavedAt` always moves the time.
    const guard: WriteGuard = {
        ...params.guard,
        contentId: record.contentId,
        published: true,
        draft: draft?.updatedAt ?? null,
    };
    const userId = user?.id ?? null;

    const saved = await writeGuarded({
        type: 'entry',
        address: { id: record.id, locale: record.locale },
        guard,
        repository: entryRepository,
        write: () =>
            entryDraftRepository.save(
                {
                    entryId: record.id,
                    locale: record.locale,
                    title: data.title ?? base.title,
                    slug: data.slug ?? base.slug,
                    fields: fields ?? base.fields,
                    createdBy: userId,
                    updatedBy: userId,
                    updatedAt: draftSavedAt(draft?.updatedAt),
                },
                { replaces: draft !== null, holds: entryRepository.guardHolds(guard) }
            ),
    });
    return withDraft(record, saved);
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
        resolveValidationMode({
            status,
            hasStatuses: entryType.capabilities.statuses,
        }) === 'complete'
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
    id: string;
    locale: string;
    write: EntryRowWrite;
    guard: WriteGuard;
}): Promise<EntryResource> {
    const { config, id, locale, write, guard } = params;
    const entry = await writeGuarded({
        type: 'entry',
        address: { id, locale },
        guard,
        repository: entryRepository,
        write: () => entryRepository.translatable.create({ id, locale }, write, guard),
    });
    await syncEntryRelationships(config, entry);
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
