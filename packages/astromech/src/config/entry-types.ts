/**
 * Resolving authored entry types, the site's and every plugin's, into one map
 * keyed by id: each type's capabilities and field tree.
 */

import type { EntryFields, ResolvedEntryFields } from '@/types/fields';
import type {
    AstromechConfig,
    EntryType,
    ResolvedEntryCapabilities,
    ResolvedEntryType,
} from '@/types/index';
import { QUALIFIED_SEPARATOR, qualifyEntryType } from '@/entries/entry-types';
import { assertUniqueDataNames, validateFieldTree } from '@/fields/field-tree';
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
        resolved[id] = toResolvedEntryType(id, entryType, plugin);
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

/** Crash-loud validation for `titleField`: `'title'` or `false`, nothing else. */
export function assertEntryTypeValid(typeKey: string, entryType: EntryType): void {
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
 * Resolve a single entry type: validate its titleField and field tree
 * (crash-loud on mismatch). `typeKey` is stamped onto the result as `id`, used
 * in error messages.
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
