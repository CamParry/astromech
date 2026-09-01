/**
 * The values an entry write stores: a pre-step (inherit the entry's shared
 * fields, or merge the patch over the current row), then the field parse, then
 * a prune of dead relation ids.
 */

import type { EntryRepository } from '../repository/types';
import type { EntryRecord } from './records';
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
          /** The entry a new translation belongs to; absent on a fresh create. */
          entryId: string | undefined;
          status: EntryStatus;
      }
    | {
          kind: 'update';
          repository: EntryRepository;
          entryType: ResolvedEntryType;
          currentEntry: EntryRecord;
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
          canonical: EntryRecord;
          staged: EntryRecord;
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
        const { repository, entryType } = input;
        return {
            values: await inheritSharedFields({
                repository,
                entryType,
                values: input.values,
                definitions,
                entryId: input.entryId,
                locale: input.locale,
            }),
            type: entryType.id,
            locale: input.locale,
            status: input.status,
            record: null,
        };
    }

    if (input.kind === 'update') {
        const { entryType, currentEntry } = input;
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
            // The entry's own row is the only one the uniqueness scan must
            // ignore: its staged copy shares its id and `list` excludes staged
            // rows anyway.
            excludeId: [currentEntry.id],
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
        excludeId: [canonical.id],
    };
}
