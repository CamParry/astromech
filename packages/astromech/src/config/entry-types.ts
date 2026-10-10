/**
 * Resolving authored entry types, the site's and every plugin's, into one map
 * keyed by id: each type's capabilities and field tree, and unique types per
 * array.
 */

import type { EntryFields, ResolvedEntryFields } from '@/types/fields';
import type {
    AstromechConfig,
    EntryType,
    ResolvedEntryCapabilities,
    ResolvedEntryType,
} from '@/types/index';
import { qualifyEntryType } from '@/entries/entry-types';
import { assertSortableColumns } from '@/entries/sort-fields';
import { assertUniqueDataNames, validateFieldTree } from '@/fields/field-tree';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';

/**
 * Resolve the site's entry types under their own `type` and each plugin's
 * under `<namespace>/<type>`, into the one map the runtime reads. A type may
 * not hold the separator, so the two cannot collide.
 */
export function resolveEntryTypes(
    config: Pick<AstromechConfig, 'entries' | 'plugins'>
): Record<string, ResolvedEntryType> {
    const resolved: Record<string, ResolvedEntryType> = {};
    const site = config.entries ?? [];
    // A config file is loaded without type checking, so say what shape is
    // expected rather than fail on the first array method.
    if (!Array.isArray(site)) {
        throw new Error(
            'Astromech: `entries` is an array of entry types, each naming its own ' +
                "`type`: `entries: [{ type: 'post', single: 'Post', ... }]`."
        );
    }
    assertUniqueEntryTypes('the site config', site);
    for (const entryType of site) {
        resolved[entryType.type] = toResolvedEntryType(entryType.type, entryType);
    }
    for (const plugin of config.plugins ?? []) {
        const entryTypes = plugin.entries ?? [];
        assertUniqueEntryTypes(`plugin "${plugin.package}"`, entryTypes);
        const { namespace } = resolvePluginIdentity(plugin);
        for (const entryType of entryTypes) {
            const id = qualifyEntryType(namespace, entryType.type);
            resolved[id] = toResolvedEntryType(id, entryType, namespace);
        }
    }
    return resolved;
}

/**
 * Reject a type declared twice within one `entries` array. `owner` names where
 * the array came from, e.g. `the site config` or `plugin "@astromech/forms"`.
 */
export function assertUniqueEntryTypes(owner: string, entryTypes: EntryType[]): void {
    const seen = new Map<string, number>();
    for (const [index, entryType] of entryTypes.entries()) {
        const first = seen.get(entryType.type);
        if (first !== undefined) {
            throw new Error(
                `Astromech: ${owner} declares the entry type "${entryType.type}" twice ` +
                    `(entries[${first}] and entries[${index}]). Every type is unique.`
            );
        }
        seen.set(entryType.type, index);
    }
}

/** Characters an entry type may not contain: both are id separators. */
const ENTRY_TYPE_FORBIDDEN = /[/:]/;

/** Resolve the capability set for an entry type: each option or its default. */
export function toResolvedEntryCapabilities(
    entryType: EntryType
): ResolvedEntryCapabilities {
    return {
        statuses: entryType.statuses ?? true,
        slug: entryType.slug !== false,
        trash: entryType.trash ?? true,
        versioning: Boolean(entryType.versioning),
        staging: Boolean(entryType.staging),
        translatable: entryType.translatable ?? false,
    };
}

/**
 * Crash-loud validation of an entry type's `type` (non-empty, no separator)
 * and its `titleField` (`'title'` or `false`, nothing else).
 */
export function assertEntryTypeValid(typeKey: string, entryType: EntryType): void {
    if (entryType.type === undefined || entryType.type === '') {
        throw new Error(
            `Astromech entry type "${typeKey}": every entry type needs a non-empty \`type\`.`
        );
    }

    if (ENTRY_TYPE_FORBIDDEN.test(entryType.type)) {
        throw new Error(
            `Astromech entry type "${typeKey}": type must not contain "/" or ":" ` +
                `(got "${entryType.type}"). A plugin's entry type is qualified as ` +
                `"<namespace>/<type>" by Astromech.`
        );
    }

    if (
        entryType.titleField !== undefined &&
        entryType.titleField !== false &&
        entryType.titleField !== 'title'
    ) {
        throw new Error(
            `Astromech entry type "${typeKey}": titleField must be 'title' or false ` +
                `(got "${String(entryType.titleField)}"). A custom title field name is not ` +
                `supported — a type is either titled on \`title\` or titleless.`
        );
    }
}

/** Normalize the authored `fields` shape into the resolved two-column layout. */
export function toResolvedFields(fields: EntryFields | undefined): ResolvedEntryFields {
    if (fields === undefined) return { main: [], sidebar: [] };
    if (Array.isArray(fields)) return { main: fields, sidebar: [] };
    return { main: fields.main, sidebar: fields.sidebar ?? [] };
}

/**
 * Resolve a single entry type: validate its titleField, field tree and
 * sortable admin columns (crash-loud on mismatch). `typeKey` is stamped onto
 * the result as `id`, used in error messages.
 */
export function toResolvedEntryType(
    typeKey: string,
    entryType: EntryType,
    plugin?: string
): ResolvedEntryType {
    const capabilities = toResolvedEntryCapabilities(entryType);
    assertEntryTypeValid(typeKey, entryType);

    const resolvedFields = toResolvedFields(entryType.fields);
    const owner = `entry type "${typeKey}"`;
    validateFieldTree(owner, resolvedFields.main);
    validateFieldTree(owner, resolvedFields.sidebar);
    assertUniqueDataNames(owner, resolvedFields);
    assertSortableColumns(owner, entryType.adminColumns ?? [], resolvedFields);

    const { fields: _fields, type: _type, ...rest } = entryType;
    return {
        ...rest,
        id: typeKey,
        ...(plugin !== undefined ? { plugin } : {}),
        fields: resolvedFields,
        capabilities,
        titleField: entryType.titleField ?? 'title',
    };
}
