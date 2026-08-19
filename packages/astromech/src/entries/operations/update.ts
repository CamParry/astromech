import type { EntryStorage, StorageDb } from '../storage/types';
import type { Field } from '@/types/fields';
import type {
    Entry,
    EntryStatus,
    EntryUpdateData,
    EntryUpdateParams,
    JsonObject,
    ResolvedEntryType,
} from '@/types/index';
import { getConfig } from '@/config/registry';
import { flattenEntryFields } from '@/fields/flatten';
import { assertNoFieldErrors, parseFields } from '@/fields/pipeline';
import { mergePatch, projectToSchema } from '@/fields/values';
import { getCurrentUser } from '@/request-context/index';
import { resolveEntryType } from '@/utilities/entry-type-ids';
import { UnknownEntryTypeError } from '../errors';
import { runBulk } from '../internal/bulk';
import { pruneDanglingRelations } from '../internal/dangling-relations';
import { runUpdateWithHooks } from '../internal/hooks';
import { asEntry, loadAndAssertType } from '../internal/records';
import { indexEntryRelationships } from '../internal/relationships';
import { uniqueSlugIfChanged } from '../internal/slug';
import { propagateSharedFields } from '../internal/translatable';
import { validate } from '../internal/validate';
import { changesVersionedContent, snapshotVersion } from '../internal/versions';
import { createEntryLookups } from '../lookups';
import { updateEntrySchema } from '../schema';
import { getEntryStorage } from '../storage/registry';
import { entryValidationMode } from '../validation-mode.shared';
import { isPublicBranded, PublicShapeWriteError } from '../visibility';

/** What the field helpers below need to know about the update in progress. */
type FieldContext = {
    storage: EntryStorage;
    db: StorageDb | undefined;
    entryType: ResolvedEntryType;
    currentEntry: Entry;
    status: EntryStatus | undefined;
};

/**
 * Updates one entry or many: validates the patch against the type's schema,
 * writes each row, and fires the entry update hooks around the write.
 */
export async function update(params: EntryUpdateParams): Promise<Entry | Entry[]> {
    // Guards
    if (params.data.fields !== undefined && isPublicBranded(params.data.fields)) {
        throw new PublicShapeWriteError();
    }
    const entryType = resolveEntryType(getConfig(), params.type);
    if (!entryType) {
        throw new UnknownEntryTypeError(params.type);
    }

    const id = params.id;
    if (typeof id === 'string') {
        const storage = getEntryStorage(entryType.id);
        return runUpdateWithHooks(entryType.id, [id], params.data, () =>
            updateOne({ storage, db: undefined, entryType, id, data: params.data })
        );
    }

    // A single slug across many ids would violate (type, locale) uniqueness.
    if (params.data.slug !== undefined) {
        throw new Error(
            'Bulk update cannot set `slug`: a single value across multiple ids ' +
                'would violate (type, locale) slug uniqueness. Update slugs individually.'
        );
    }
    return runUpdateWithHooks(entryType.id, id, params.data, () =>
        runBulk(entryType.id, id, (txStorage, txDb, bulkId) =>
            updateOne({
                storage: txStorage,
                db: txDb,
                entryType,
                id: bulkId,
                data: params.data,
            })
        )
    );
}

/**
 * Updates one entry: validates the patch, versions the state it replaces,
 * writes the row, then re-indexes relationships and propagates shared fields.
 */
async function updateOne(params: {
    storage: EntryStorage;
    db: StorageDb | undefined;
    entryType: ResolvedEntryType;
    id: string;
    data: EntryUpdateData;
}): Promise<Entry> {
    const { storage, db, entryType, id, data } = params;

    // Lookups
    const currentEntry = await loadAndAssertType(storage, entryType.id, id);

    // Validation
    const titled = entryType.titleField !== false;
    const validated = validate(updateEntrySchema({ titled }), data);

    // Fields
    const patch = validated.fields;
    const patchedFieldNames = patch ? getPatchedFieldNames(patch) : [];
    const fields = patch
        ? await toStoredFields(patch, patchedFieldNames, {
              storage,
              db,
              entryType,
              currentEntry,
              status: validated.status,
          })
        : undefined;

    // Version — before the slug is uniquified, so it compares what the caller sent.
    if (
        entryType.capabilities.versioning &&
        storage.versions &&
        changesVersionedContent(currentEntry, {
            title: validated.title,
            slug: validated.slug,
            fields,
        })
    ) {
        await snapshotVersion(storage.versions, currentEntry);
    }

    // Defaults
    const publishedAt =
        validated.status === 'published' && !currentEntry.publishedAt
            ? new Date()
            : validated.publishedAt;
    const slug = await uniqueSlugIfChanged(
        storage,
        entryType.id,
        currentEntry,
        validated.slug
    );

    // Persist
    const entry = asEntry(
        await storage.update(id, {
            title: validated.title,
            slug,
            fields,
            status: validated.status,
            publishedAt,
        })
    );
    if (fields) {
        await indexEntryRelationships(entry, fields, entryType.id, db);
        await propagateSharedFields({
            storage,
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
    const { storage, db, entryType, currentEntry, status } = context;
    const definitions = flattenEntryFields(entryType.fields);
    const excludeIds = await getUniquenessExcludeIds({
        storage,
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
        lookups: createEntryLookups(storage, {
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
        projectToSchema(parsed.values, definitions) as JsonObject,
        db
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
    storage: EntryStorage;
    entryType: ResolvedEntryType;
    currentEntry: Entry;
    definitions: Field[];
}): Promise<string[]> {
    const { storage, entryType, currentEntry, definitions } = params;
    const excludeIds = [currentEntry.id];

    const canStage = entryType.capabilities.staging === true;
    const hasUniqueField = definitions.some((field) =>
        field.validation?.some((rule) => 'unique' in rule)
    );
    if (!canStage || !hasUniqueField) return excludeIds;

    const paired =
        currentEntry.stagedFor ??
        (await storage.staging?.getByCanonical(currentEntry.id))?.id;
    if (paired) excludeIds.push(paired);
    return excludeIds;
}
