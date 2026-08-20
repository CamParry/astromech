import type { EntryRepository, RepositoryDb } from '../repository/types';
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
import { resolveEntryType } from '@/entries/type-ids.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { assertNoFieldErrors, parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { getCurrentUser } from '@/request-context/index';
import { UnknownEntryTypeError } from '../errors';
import { runOnIds } from '../internal/bulk';
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
import { entryValidationMode } from '../validation-mode.shared';
import { isPublicBranded, PublicShapeWriteError } from '../visibility';

/** What the field helpers below need to know about the update in progress. */
type FieldContext = {
    repository: EntryRepository;
    db: RepositoryDb | undefined;
    entryType: ResolvedEntryType;
    currentEntry: Entry;
    status: EntryStatus | undefined;
};

/**
 * Updates one entry or many: validates the patch against the type's schema,
 * writes each row, and fires the entry update hooks around the write.
 */
export async function update(params: EntryUpdateParams): Promise<Entry | Entry[]> {
    if (params.data.fields !== undefined && isPublicBranded(params.data.fields)) {
        throw new PublicShapeWriteError();
    }
    const entryType = resolveEntryType(getConfig(), params.type);
    if (!entryType) {
        throw new UnknownEntryTypeError(params.type);
    }

    // A single slug across many ids would violate (type, locale) uniqueness.
    if (Array.isArray(params.id) && params.data.slug !== undefined) {
        throw new Error(
            'Bulk update cannot set `slug`: a single value across multiple ids ' +
                'would violate (type, locale) slug uniqueness. Update slugs individually.'
        );
    }

    const ids = Array.isArray(params.id) ? params.id : [params.id];
    return runUpdateWithHooks(entryType.id, ids, params.data, () =>
        runOnIds(entryType.id, params.id, (repository, db, id) =>
            updateOne({ repository, db, entryType, id, data: params.data })
        )
    );
}

/**
 * Updates one entry: validates the patch, versions the state it replaces,
 * writes the row, then re-indexes relationships and propagates shared fields.
 */
async function updateOne(params: {
    repository: EntryRepository;
    db: RepositoryDb | undefined;
    entryType: ResolvedEntryType;
    id: string;
    data: EntryUpdateData;
}): Promise<Entry> {
    const { repository, db, entryType, id, data } = params;

    const currentEntry = await loadAndAssertType(repository, entryType.id, id);

    const titled = entryType.titleField !== false;
    const validated = validate(updateEntrySchema({ titled }), data);

    const patch = validated.fields;
    const patchedFieldNames = patch ? getPatchedFieldNames(patch) : [];
    const fields = patch
        ? await toStoredFields(patch, patchedFieldNames, {
              repository,
              db,
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
        await repository.update(id, {
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
