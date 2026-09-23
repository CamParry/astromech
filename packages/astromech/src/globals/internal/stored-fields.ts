/**
 * The values a global write stores: a pre-step (inherit the global's shared
 * fields on a first write to a locale, or merge the patch over the current row),
 * then the field parse, then a prune of dead relation ids.
 */

import type { GlobalRow, GlobalsRepository } from '../repository/globals-table';
import type {
    EntryStatus,
    Global,
    JsonObject,
    ResolvedConfig,
    ResolvedGlobal,
    User,
} from '@/types/index';
import { pruneDanglingRelations } from '@/content/dangling-relations';
import { inheritSharedFields } from '@/content/translatable';
import { isUniqueAmong } from '@/content/unique';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { entryValidationMode } from '@/entries/validation-mode';
import { flattenEntryFields } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';

/**
 * Turns what a caller sent into the values that go in the row. Throws a 422 when
 * a field or the global's own validator reports.
 *
 * `current` absent means this locale has no row yet: the write is a create, and
 * a translatable global's shared (`translatable: false`) fields are inherited
 * from its default-locale row rather than taken from the patch.
 */
export async function toStoredFields(input: {
    repository: GlobalsRepository;
    global: ResolvedGlobal;
    /** The global's row id, or null when nothing has been saved at all. */
    id: string | null;
    locale: string;
    patch: Record<string, unknown>;
    current: GlobalRow | null;
    /** The status the row has after the write; it decides the validation mode. */
    status: EntryStatus | undefined;
    /** Who the write is attributed to; the field validators read it. */
    user: User | null;
    /** The locale a translatable global inherits its shared fields from. */
    defaultLocale: string;
    /** The config the prune reads. */
    config: ResolvedConfig;
}): Promise<JsonObject> {
    const { global, current, patch } = input;
    const definitions = flattenEntryFields(global.fields);

    const values = current
        ? // A patch, not a replacement: an omitted field keeps its stored value,
          // an explicit `null` stores null, and an array or container value
          // replaces wholesale.
          mergePatch(current.fields, patch)
        : await inheritSharedFields({
              repository: input.repository,
              values: patch,
              definitions,
              translatable: global.capabilities.translatable,
              id: input.id ?? undefined,
              locale: input.locale,
              defaultLocale: input.defaultLocale,
          });

    const record: Global | null = current ? ({ ...current } as unknown as Global) : null;

    const parsed = await parseFields(values, definitions, {
        operation: current ? 'update' : 'create',
        validation: entryValidationMode({
            status: input.status,
            hasStatuses: global.capabilities.statuses,
        }),
        resource: { kind: 'global', record },
        user: input.user,
        // One row per locale, so there is nothing else to be unique among.
        isUnique: isUniqueAmong(async () => []),
        entryTypes: (ids) => existingEntryTypes(ids),
        ...(current ? { coerceOnly: new Set(patchedFieldNames(patch)) } : {}),
        ...(global.validate ? { validate: global.validate } : {}),
    });

    // On a merge, drop keys the schema no longer declares, so data left behind
    // by a removed field does not survive every subsequent patch. The prune runs
    // after `parseFields` (its minted item ids are what the traversal needs)
    // and before the write, so the index derives from pruned values.
    const pruned = await pruneDanglingRelations(
        input.config,
        definitions,
        (current ? projectToSchema(parsed, definitions) : parsed) as JsonObject
    );
    return pruned.values;
}

/** Root field names the caller actually sent; an `undefined` value is absent. */
export function patchedFieldNames(patch: Record<string, unknown>): string[] {
    return Object.keys(patch).filter((name) => patch[name] !== undefined);
}
