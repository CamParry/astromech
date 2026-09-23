/**
 * Resolving authored entry types, the site's and every plugin's, into one map
 * keyed by id: each type's capabilities, field tree and derived search list.
 */

import type { Capability } from '@/entries/capabilities';
import type { EntryFields, ResolvedEntryFields } from '@/types/fields';
import type {
    AstromechConfig,
    EntryType,
    ResolvedEntryCapabilities,
    ResolvedEntryType,
} from '@/types/index';
import { ALL_CAPABILITIES } from '@/entries/capabilities';
import { QUALIFIED_SEPARATOR, qualifyEntryType } from '@/entries/entry-types';
import { assertUniqueDataNames, validateFieldTree } from '@/fields/field-tree';
import { flattenFieldNodes } from '@/fields/flatten';
import {
    pluginEntryTypes,
    resolvePluginIdentity,
} from '@/plugins/runtime/plugin-identity';

/** An authored entry type with the id it is addressed by and the plugin declaring it. */
export type DeclaredEntryType = {
    id: string;
    entryType: EntryType;
    plugin?: string;
};

/** Resolve every declared entry type into the one map the runtime reads. */
export function resolveEntryTypes(
    config: Pick<AstromechConfig, 'entries' | 'plugins'>
): Record<string, ResolvedEntryType> {
    const resolved: Record<string, ResolvedEntryType> = {};
    for (const { id, entryType, plugin } of declaredEntryTypes(config)) {
        resolved[id] = toResolvedEntryType(
            id,
            entryType,
            entryType.repository?.supports ?? ALL_CAPABILITIES,
            plugin
        );
    }
    return resolved;
}

/**
 * The site's entry types under their own keys, then each plugin's under
 * `<namespace>/<type>`. A site key may not hold the separator, so the two
 * cannot collide.
 */
export function declaredEntryTypes(
    config: Pick<AstromechConfig, 'entries' | 'plugins'>
): DeclaredEntryType[] {
    const declared: DeclaredEntryType[] = [];
    for (const [id, entryType] of Object.entries(config.entries)) {
        if (id.includes(QUALIFIED_SEPARATOR)) {
            throw new Error(
                `Astromech entry type "${id}": a site entry type key must not contain ` +
                    `"${QUALIFIED_SEPARATOR}". A plugin's type is qualified as ` +
                    `"<namespace>/<type>" by Astromech.`
            );
        }
        declared.push({ id, entryType });
    }
    for (const plugin of config.plugins ?? []) {
        const { namespace } = resolvePluginIdentity(plugin);
        for (const [type, entryType] of pluginEntryTypes(plugin)) {
            declared.push({
                id: qualifyEntryType(namespace, type),
                entryType,
                plugin: namespace,
            });
        }
    }
    return declared;
}

/**
 * Resolve the capability set for an entry type. When the repository supports a
 * capability, the config default applies; when it doesn't and the user
 * hasn't requested it, the capability defaults to false.
 */
export function toResolvedEntryCapabilities(
    entryType: EntryType,
    repositorySupports: readonly Capability[]
): ResolvedEntryCapabilities {
    const supports = (capability: Capability): boolean =>
        repositorySupports.includes(capability);

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
 * Rejects any capability requested but unsupported by the repository, and any
 * titleField value other than `'title'` or `false`.
 */
export function assertEntryTypeValid(
    typeKey: string,
    entryType: EntryType,
    repositorySupports: readonly Capability[]
): void {
    const requested: Capability[] = [];
    if (entryType.statuses === true) requested.push('statuses');
    if (entryType.slug !== undefined && entryType.slug !== false) requested.push('slug');
    if (entryType.trash === true) requested.push('trash');
    if (entryType.versioning) requested.push('versioning');
    if (entryType.staging) requested.push('staging');
    if (entryType.translatable === true) requested.push('translatable');

    const unsupported = requested.filter(
        (capability) => !repositorySupports.includes(capability)
    );

    if (unsupported.length > 0) {
        const supportedList =
            repositorySupports.length > 0 ? repositorySupports.join(', ') : '(none)';
        throw new Error(
            `Astromech entry type "${typeKey}" declares capabilities its repository does not support: ` +
                `${unsupported.join(', ')}. Repository supports: ${supportedList}.`
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
 * Resolve a single entry type: validate capabilities and titleField
 * (crash-loud on mismatch) and strip the live `repository` instance. `typeKey`
 * is stamped onto the result as `id`, used in error messages.
 */
export function toResolvedEntryType(
    typeKey: string,
    entryType: EntryType,
    repositorySupports: readonly Capability[],
    plugin?: string
): ResolvedEntryType {
    const capabilities = toResolvedEntryCapabilities(entryType, repositorySupports);
    assertEntryTypeValid(typeKey, entryType, repositorySupports);

    const resolvedFields = toResolvedFields(entryType.fields);
    const owner = `entry type "${typeKey}"`;
    validateFieldTree(owner, resolvedFields.main);
    validateFieldTree(owner, resolvedFields.sidebar);
    assertUniqueDataNames(owner, resolvedFields);

    // Derive search from searchable fields if not explicitly set.
    let resolvedSearch = entryType.search;
    if (resolvedSearch === undefined) {
        // Top-level fields only: a nested field's children are not top-level keys.
        const searchableNames = [
            ...flattenFieldNodes(resolvedFields.main),
            ...flattenFieldNodes(resolvedFields.sidebar),
        ]
            .filter((field) => field.searchable === true)
            .map((field) => field.name);
        if (searchableNames.length > 0) resolvedSearch = searchableNames;
    }

    const { repository: _repository, fields: _fields, type: _type, ...rest } = entryType;
    return {
        ...rest,
        id: typeKey,
        ...(plugin !== undefined ? { plugin } : {}),
        fields: resolvedFields,
        ...(resolvedSearch !== undefined ? { search: resolvedSearch } : {}),
        capabilities,
        titleField: entryType.titleField ?? 'title',
        ...(entryType.repository !== undefined ? { customTable: true as const } : {}),
    };
}
