/**
 * Resolving one authored entry type: its capabilities, its field tree, and the
 * search list derived from it.
 */

import type {
    EntryType,
    ResolvedEntryCapabilities,
    ResolvedEntryType,
} from '@/types/index';
import type { EntryFields, Field, ResolvedEntryFields } from '@/types/fields';
import type { Capability } from '@/utilities/entry-capabilities';
import {
    LAYOUT_TYPES,
    assertUniqueDataNames,
    validateFieldTree,
} from '@/config/validate/field-tree';

/**
 * Resolve the capability set for an entry type.
 *
 * When storage supports a capability, the config default applies.
 * When storage does NOT support a capability and the user has not explicitly
 * requested it, the capability defaults to false (Phase 3: narrower sets).
 */
export function resolveEntryCapabilities(
    entryType: EntryType,
    storageSupports: readonly Capability[]
): ResolvedEntryCapabilities {
    const supports = (cap: Capability): boolean => storageSupports.includes(cap);

    return {
        statuses: supports('statuses') ? (entryType.statuses ?? true) : false,
        slug: supports('slug') ? entryType.slug !== false : false,
        trash: supports('trash') ? (entryType.trash ?? true) : false,
        versioning: supports('versioning') ? Boolean(entryType.versioning) : false,
        staging: supports('staging') ? Boolean(entryType.staging) : false,
        translatable: supports('translatable')
            ? (entryType.translatable ?? false)
            : false,
    };
}

/**
 * Crash-loud validation for an entry type's capabilities and titleField.
 *
 * (a) Any capability explicitly requested by the config but not in
 *     storageSupports throws with a message mirroring plugin-runtime.ts style.
 * (b) titleField values other than 'title' or false are rejected: a type is
 *     titled on `title` or titleless, with no third option.
 */
export function assertEntryTypeValid(
    typeKey: string,
    entryType: EntryType,
    storageSupports: readonly Capability[]
): void {
    const requested: Capability[] = [];
    if (entryType.statuses === true) requested.push('statuses');
    if (entryType.slug !== undefined && entryType.slug !== false) requested.push('slug');
    if (entryType.trash === true) requested.push('trash');
    if (entryType.versioning) requested.push('versioning');
    if (entryType.staging) requested.push('staging');
    if (entryType.translatable === true) requested.push('translatable');

    const unsupported = requested.filter((cap) => !storageSupports.includes(cap));

    if (unsupported.length > 0) {
        const supportedList =
            storageSupports.length > 0 ? storageSupports.join(', ') : '(none)';
        throw new Error(
            `Astromech entry type "${typeKey}" declares capabilities its storage does not support: ` +
                `${unsupported.join(', ')}. Storage supports: ${supportedList}.`
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
 * Collect names of fields flagged `searchable`. Recurses through layout
 * fields (their children are top-level data) but not nested fields
 * (`group`/`repeater`/`blocks`), whose child names are not top-level keys.
 */
export function collectSearchable(nodes: Field[], out: string[]): void {
    for (const node of nodes) {
        if (LAYOUT_TYPES.has(node.type)) {
            collectSearchable(node.fields ?? [], out);
            continue;
        }
        if (node.searchable === true) out.push(node.name);
    }
}

/**
 * Resolve a single entry type: validate capabilities + titleField (crash-loud
 * on mismatch) and strip the live `storage` instance, which `ResolvedEntryType`
 * omits — a type's storage is reached through `entries/storage/registry.js`,
 * keyed by type, not off the config. `typeKey` is the type's addressable id —
 * the root `entries` key, or the qualified `{plugin}/{type}` key for plugin
 * types — stamped onto the result as `id` and used in error messages.
 */
export function toResolvedEntryType(
    typeKey: string,
    entryType: EntryType,
    storageSupports: readonly Capability[]
): ResolvedEntryType {
    const capabilities = resolveEntryCapabilities(entryType, storageSupports);
    assertEntryTypeValid(typeKey, entryType, storageSupports);

    const resolvedFields = toResolvedFields(entryType.fields);
    validateFieldTree(typeKey, resolvedFields.main, false);
    validateFieldTree(typeKey, resolvedFields.sidebar, false);
    assertUniqueDataNames(typeKey, resolvedFields);

    // Derive search from searchable fields if not explicitly set.
    let resolvedSearch = entryType.search;
    if (resolvedSearch === undefined) {
        const searchableNames: string[] = [];
        collectSearchable(resolvedFields.main, searchableNames);
        collectSearchable(resolvedFields.sidebar, searchableNames);
        if (searchableNames.length > 0) resolvedSearch = searchableNames;
    }

    const { storage: _storage, fields: _fields, type: _type, ...rest } = entryType;
    return {
        ...rest,
        id: typeKey,
        fields: resolvedFields,
        ...(resolvedSearch !== undefined ? { search: resolvedSearch } : {}),
        capabilities,
        titleField: entryType.titleField ?? 'title',
    };
}
