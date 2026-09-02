/**
 * The values a global write stores: a pre-step (inherit the global's shared
 * fields on a first write to a locale, or merge the patch over the current row),
 * then the field parse. No slug, no title and no relationship pruning — a global
 * has none of the three.
 */

import type { GlobalRow, GlobalsRepository } from '../repository/globals-table';
import type { Global, JsonObject, ResolvedGlobal } from '@/types/index';
import { getDefaultContentLocale } from '@/config/content-locale';
import { inheritSharedFields } from '@/content/translatable';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { entryValidationMode } from '@/entries/validation-mode.shared';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenEntryFields } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { getCurrentUser } from '@/request-context/request-context';

/**
 * Field lookups for a global. A global has exactly one row per locale, so
 * `isUnique` has nothing to scan against and always answers true; `entryTypes`
 * is still supplied, since a relationship field's target-type check reads real
 * rows.
 */
export function globalLookups(): ReturnType<typeof fieldLookupsFromRecords> {
    return fieldLookupsFromRecords<never>({
        load: async () => [],
        getId: () => undefined,
        getFields: () => ({}),
        entryTypes: (ids) => existingEntryTypes(ids),
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
              defaultLocale: getDefaultContentLocale(),
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
        user: await getCurrentUser(),
        lookups: globalLookups(),
        ...(current ? { coerceOnly: new Set(patchedFieldNames(patch)) } : {}),
        ...(global.validate ? { validate: global.validate } : {}),
    });

    // On a merge, drop keys the schema no longer declares, so data left behind
    // by a removed field does not survive every subsequent patch.
    return (current ? projectToSchema(parsed, definitions) : parsed) as JsonObject;
}

/** Root field names the caller actually sent; an `undefined` value is absent. */
export function patchedFieldNames(patch: Record<string, unknown>): string[] {
    return Object.keys(patch).filter((name) => patch[name] !== undefined);
}
