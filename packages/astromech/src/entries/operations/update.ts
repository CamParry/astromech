import type { EntryRepository } from '../repository/types';
import type { Field } from '@/types/fields';
import type {
    Entry,
    EntryStatus,
    EntryUpdateData,
    JsonObject,
    ResolvedEntryType,
} from '@/types/index';
import { getConfig } from '@/config/registry';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/type-ids.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { assertNoFieldErrors, parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { runHook } from '@/hooks/index';
import { getCurrentUser } from '@/request-context/index';
import { BulkOperationError, UnknownEntryTypeError } from '../errors';
import { pruneDanglingRelations } from '../internal/dangling-relations';
import { asEntry, loadEntries } from '../internal/records';
import { indexEntryRelationships } from '../internal/relationships';
import { uniqueSlugIfChanged } from '../internal/slug';
import { propagateSharedFields } from '../internal/translatable';
import { validate } from '../internal/validate';
import { changesVersionedContent, snapshotVersion } from '../internal/versions';
import { createEntryLookups } from '../lookups';
import { getEntryRepository } from '../repository/registry';
import { updateEntrySchema } from '../schema';
import { entryValidationMode } from '../validation-mode.shared';
import { isPublicBranded, PublicShapeWriteError } from '../visibility';

/** What the field helpers below need to know about the update in progress. */
type FieldContext = {
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    currentEntry: Entry;
    status: EntryStatus | undefined;
};

/**
 * Updates a batch of entries, atomically, firing the entry update hooks around
 * the write. A single id is a batch of one (decisions/0077). Throws if an id is
 * missing or of another type before any hook fires or any row is touched.
 */
export async function updateEntries(params: {
    type: string;
    ids: readonly string[];
    data: EntryUpdateData;
}): Promise<Entry[]> {
    if (params.data.fields !== undefined && isPublicBranded(params.data.fields)) {
        throw new PublicShapeWriteError();
    }
    const entryType = resolveEntryType(getConfig(), params.type);
    if (!entryType) {
        throw new UnknownEntryTypeError(params.type);
    }

    // A single slug across many ids would violate (type, locale) uniqueness.
    if (params.ids.length > 1 && params.data.slug !== undefined) {
        throw new Error(
            'Bulk update cannot set `slug`: a single value across multiple ids ' +
                'would violate (type, locale) slug uniqueness. Update slugs individually.'
        );
    }

    const repository = getEntryRepository(entryType.id);
    const user = await getCurrentUser();

    // Fetch each row once, at the top: this record feeds both the before-hook
    // context and updateOne (point 3 — no second load per id).
    const entries = await loadEntries(repository, entryType.id, params.ids);

    for (const entry of entries) {
        await runHook('entry:beforeUpdate', {
            type: entryType.id,
            entry,
            data: params.data,
            user,
        });
    }

    const results = await transaction(async () => {
        const out: Entry[] = [];
        const succeeded: string[] = [];
        for (const currentEntry of entries) {
            try {
                out.push(
                    await updateOne({
                        repository,
                        entryType,
                        currentEntry,
                        data: params.data,
                    })
                );
                succeeded.push(currentEntry.id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: currentEntry.id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
        return out;
    });

    for (const entry of entries) {
        // A throw here propagates; the write above stays (decisions/0081).
        await runHook('entry:afterUpdate', {
            type: entryType.id,
            entry,
            data: params.data,
            user,
        });
    }

    return results;
}

/**
 * Updates one entry: validates the patch, versions the state it replaces,
 * writes the row, then re-indexes relationships and propagates shared fields.
 */
async function updateOne(params: {
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    currentEntry: Entry;
    data: EntryUpdateData;
}): Promise<Entry> {
    const { repository, entryType, currentEntry, data } = params;

    const titled = entryType.titleField !== false;
    const validated = validate(updateEntrySchema({ titled }), data);

    const patch = validated.fields;
    const patchedFieldNames = patch ? getPatchedFieldNames(patch) : [];
    const fields = patch
        ? await toStoredFields(patch, patchedFieldNames, {
              repository,
              entryType,
              currentEntry,
              status: validated.status,
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
        await snapshotVersion(repository.versions, currentEntry);
    }

    const publishedAt =
        validated.status === 'published' && !currentEntry.publishedAt
            ? new Date()
            : validated.publishedAt;
    const slug = await uniqueSlugIfChanged(
        repository,
        entryType.id,
        currentEntry,
        validated.slug
    );

    const entry = asEntry(
        await repository.update(currentEntry.id, {
            title: validated.title,
            slug,
            fields,
            status: validated.status,
            publishedAt,
        })
    );
    if (fields) {
        await indexEntryRelationships(entry, fields, entryType.id);
        await propagateSharedFields({
            repository,
            entryType,
            entry: currentEntry,
            fields,
            patchedFieldNames,
        });
    }
    return entry;
}

/**
 * Converts a field patch into the values to store: merges it over the entry's
 * current fields, coerces and validates the merged document, and drops dead
 * relation ids. Throws a 422 when a field or the type's own validator reports.
 */
async function toStoredFields(
    patch: Record<string, unknown>,
    patchedFieldNames: string[],
    context: FieldContext
): Promise<JsonObject> {
    const { repository, entryType, currentEntry, status } = context;
    const definitions = flattenEntryFields(entryType.fields);
    const excludeIds = await getUniquenessExcludeIds({
        repository,
        entryType,
        currentEntry,
        definitions,
    });

    // A patch, not a replacement: an omitted field keeps its stored value, an
    // explicit `null` stores null, and an array or container value replaces
    // wholesale. Only patched fields are coerced; validation sees the merge.
    const merged = mergePatch(currentEntry.fields, patch);

    const resourceValidate = entryType.validate;
    const parsed = await parseFields(merged, definitions, {
        operation: 'update',
        // An update that omits `status` keeps the row's current one, so
        // editing an already-published entry still enforces completeness.
        validation: entryValidationMode({
            status: status ?? currentEntry.status,
            hasStatuses: entryType.capabilities.statuses !== false,
        }),
        resource: { kind: 'entry', record: currentEntry },
        user: await getCurrentUser(),
        lookups: createEntryLookups(repository, {
            type: entryType.id,
            locale: currentEntry.locale,
            excludeId: excludeIds,
        }),
        coerceOnly: new Set(patchedFieldNames),
        ...(resourceValidate ? { resourceValidate } : {}),
    });
    assertNoFieldErrors(parsed);

    // After `parseFields` (its minted item ids are what the traversal needs)
    // and before the write, so the index derives from pruned values.
    const pruned = await pruneDanglingRelations(
        definitions,
        projectToSchema(parsed.values, definitions) as JsonObject
    );
    return pruned.values;
}

/** Root field names the caller actually sent; an `undefined` value is absent. */
function getPatchedFieldNames(patch: Record<string, unknown>): string[] {
    return Object.keys(patch).filter((name) => patch[name] !== undefined);
}

/**
 * Ids a unique-field scan must ignore: the entry itself, plus its staged copy
 * or canonical, which are one logical entry as far as uniqueness goes. Only
 * looked up when the type can stage and some field is actually unique.
 */
async function getUniquenessExcludeIds(params: {
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    currentEntry: Entry;
    definitions: Field[];
}): Promise<string[]> {
    const { repository, entryType, currentEntry, definitions } = params;
    const excludeIds = [currentEntry.id];

    const canStage = entryType.capabilities.staging === true;
    const hasUniqueField = definitions.some((field) =>
        field.validation?.some((rule) => 'unique' in rule)
    );
    if (!canStage || !hasUniqueField) return excludeIds;

    const paired =
        currentEntry.stagedFor ??
        (await repository.staging?.getByCanonical(currentEntry.id))?.id;
    if (paired) excludeIds.push(paired);
    return excludeIds;
}
