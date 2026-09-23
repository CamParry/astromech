/**
 * The values a global write stores: a pre-step (inherit the global's shared
 * fields on a first write to a locale, or merge the patch over the current row),
 * then the field parse, then a prune of dead relation ids.
 */

import type { GlobalRow, GlobalsRepository } from '../repository/globals-table';
import type {
    DataField,
    Global,
    JsonObject,
    ResolvedConfig,
    ResolvedGlobal,
    User,
} from '@/types/index';
import { pruneDanglingRelations } from '@/content/dangling-relations';
import { inheritSharedFields } from '@/content/translatable';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { entryValidationMode } from '@/entries/validation-mode';
import { flattenEntryFields } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { uniqueAmongRecords } from '@/fields/unique-among';
import { mergePatch, projectToSchema } from '@/fields/values';

/**
 * The uniqueness check for a global. A global has exactly one row per locale, so
 * there is nothing to scan against and it always answers true.
 */
export function globalIsUnique(): (field: DataField, value: unknown) => Promise<boolean> {
    return uniqueAmongRecords<never>({
        load: async () => [],
        getId: () => undefined,
        getFields: () => ({}),
    });
}

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
            // An update that changes no status keeps the row's current one, so
            // editing an already-published global still enforces completeness.
            status: current?.status,
            hasStatuses: global.capabilities.statuses,
        }),
        resource: { kind: 'global', record },
        user: input.user,
        isUnique: globalIsUnique(),
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
