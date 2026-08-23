/**
 * The values an entry write stores: a pre-step (inherit the locale group's
 * shared fields, or merge the patch over the current row), then the field
 * parse, then a prune of dead relation ids.
 */

import type { EntryRepository, EntryRow } from '../repository/types';
import type { Field } from '@/types/fields';
import type { Entry, EntryStatus, JsonObject, ResolvedEntryType } from '@/types/index';
import { flattenEntryFields } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { getCurrentUser } from '@/request-context/request-context';
import { createEntryLookups } from '../lookups';
import { entryValidationMode } from '../validation-mode.shared';
import { pruneDanglingRelations } from './dangling-relations';
import { inheritSharedFields } from './translatable';

/**
 * The three write paths that store field values, each with what its own
 * pre-step needs. A merge is an `'update'` to the parse, so the tag names the
 * write path rather than the operation.
 */
export type StoredFieldsInput =
    | {
          kind: 'create';
          repository: EntryRepository;
          entryType: ResolvedEntryType;
          values: Record<string, unknown>;
          locale: string;
          localeGroup: string | undefined;
          status: EntryStatus;
      }
    | {
          kind: 'update';
          repository: EntryRepository;
          entryType: ResolvedEntryType;
          currentEntry: Entry;
          patch: Record<string, unknown>;
          patchedFieldNames: string[];
          status: EntryStatus | undefined;
      }
    | {
          kind: 'merge';
          repository: EntryRepository;
          /** Absent when the canonical's type is no longer configured. */
          entryType: ResolvedEntryType | undefined;
          type: string;
          canonical: Entry;
          staged: EntryRow;
      };

/**
 * Turns what a caller sent into the values that go in the row. Throws a 422
 * when a field or the type's own validator reports.
 */
export async function toStoredFields(input: StoredFieldsInput): Promise<JsonObject> {
    const { repository, entryType } = input;
    const definitions = entryType ? flattenEntryFields(entryType.fields) : [];
    const write = await prepareWrite(input, definitions);

    const validate = entryType?.validate;
    const values = await parseFields(write.values, definitions, {
        operation: input.kind === 'create' ? 'create' : 'update',
        validation: entryValidationMode({
            status: write.status,
            hasStatuses: entryType ? entryType.capabilities.statuses !== false : true,
        }),
        resource: { kind: 'entry', record: write.record },
        user: await getCurrentUser(),
        lookups: createEntryLookups(repository, {
            type: write.type,
            locale: write.locale,
            ...(write.excludeId ? { excludeId: write.excludeId } : {}),
        }),
        ...(write.coerceOnly ? { coerceOnly: write.coerceOnly } : {}),
        ...(validate ? { validate } : {}),
    });

    // After `parseFields` (its minted item ids are what the traversal needs)
    // and before the write, so the index derives from pruned values.
    const pruned = await pruneDanglingRelations(
        definitions,
        (input.kind === 'update'
            ? projectToSchema(values, definitions)
            : values) as JsonObject
    );
    return pruned.values;
}

/** What the parse needs from the write path, resolved to concrete values. */
type PreparedWrite = {
    values: Record<string, unknown>;
    type: string;
    locale: string;
    status: EntryStatus | undefined;
    record: Entry | null;
    excludeId?: readonly string[];
    coerceOnly?: ReadonlySet<string>;
};

async function prepareWrite(
    input: StoredFieldsInput,
    definitions: Field[]
): Promise<PreparedWrite> {
    if (input.kind === 'create') {
        const { repository, entryType, localeGroup } = input;
        return {
            values: await inheritSharedFields({
                repository,
                entryType,
                values: input.values,
                definitions,
                localeGroup,
            }),
            type: entryType.id,
            locale: input.locale,
            status: input.status,
            record: null,
        };
    }

    if (input.kind === 'update') {
        const { repository, entryType, currentEntry } = input;
        const excludeId = await getUniquenessExcludeIds({
            repository,
            entryType,
            currentEntry,
            definitions,
        });
        return {
            // A patch, not a replacement: an omitted field keeps its stored value, an
            // explicit `null` stores null, and an array or container value replaces
            // wholesale. Only patched fields are coerced; validation sees the merge.
            values: mergePatch(currentEntry.fields, input.patch),
            type: entryType.id,
            locale: currentEntry.locale,
            // An update that omits `status` keeps the row's current one, so
            // editing an already-published entry still enforces completeness.
            status: input.status ?? currentEntry.status,
            record: currentEntry,
            excludeId,
            coerceOnly: new Set(input.patchedFieldNames),
        };
    }

    const { canonical, staged } = input;
    return {
        values: (staged.fields ?? {}) as Record<string, unknown>,
        type: input.type,
        locale: canonical.locale,
        status: canonical.status,
        record: canonical,
        // Two rows hold this content right now and both must be invisible to
        // the uniqueness scan: the canonical (about to be overwritten with
        // it) and the staged row (about to be deleted). Excluding only one
        // makes every `unique` field collide with its own other copy.
        excludeId: [canonical.id, staged.id],
    };
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
