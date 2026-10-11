/**
 * Resolving authored entry types, the site's and every plugin's, into one map
 * keyed by id: each type's capabilities and field tree, and unique types per
 * array.
 */

import type { DataField, EntryFields, ResolvedEntryFields } from '@/types/fields';
import type {
    AdminColumn,
    AstromechConfig,
    EntryType,
    ResolvedEntryCapabilities,
    ResolvedEntryType,
} from '@/types/index';
import { sortableColumns } from '@/content/resources';
import { ID_SEPARATORS, PROTOTYPE_KEY, qualifyEntryType } from '@/entries/entry-types';
import { sortableFieldNames } from '@/entries/sort-fields';
import { assertUniqueDataNames, validateFieldTree } from '@/fields/field-tree';
import { flattenEntryFields } from '@/fields/flatten';
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
 * Crash-loud validation of an entry type's `type` (non-empty, no separator,
 * not `__proto__`) and its `titleField` (`'title'` or `false`, nothing else).
 */
export function assertEntryTypeValid(typeKey: string, entryType: EntryType): void {
    if (entryType.type === undefined || entryType.type === '') {
        throw new Error(
            `Astromech entry type "${typeKey}": every entry type needs a non-empty \`type\`.`
        );
    }

    if (ID_SEPARATORS.test(entryType.type)) {
        throw new Error(
            `Astromech entry type "${typeKey}": type must not contain "/" or ":" ` +
                `(got "${entryType.type}"). A plugin's entry type is qualified as ` +
                `"<namespace>/<type>" by Astromech.`
        );
    }

    if (entryType.type === PROTOTYPE_KEY) {
        throw new Error(
            `Astromech entry type "${typeKey}": type must not be "${PROTOTYPE_KEY}", ` +
                `which names an object's prototype rather than a key.`
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
 * Resolve a single entry type: validate its titleField, field tree, admin
 * columns and grid fields (crash-loud on mismatch). `typeKey` is stamped onto
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
    assertAdminColumns(owner, entryType.adminColumns ?? [], resolvedFields);
    assertGridFields(owner, entryType.gridFields ?? [], resolvedFields);

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

/**
 * Throw when an admin column names no top-level field of the type, since the
 * admin reads a column's value from the entry's `fields` and would show
 * nothing. Throw too when a column asks for a sort the entries list would
 * refuse, or would apply to the system column rather than the field the column
 * shows, so the admin never offers one. `owner` names the type in the message.
 */
export function assertAdminColumns(
    owner: string,
    columns: readonly AdminColumn[],
    fields: ResolvedEntryFields
): void {
    const declared = flattenEntryFields(fields);
    const sortable = sortableFieldNames(fields, 'full');
    for (const column of columns) {
        const prefix = `Astromech ${owner}: admin column "${column.field}"`;
        const field = declaredField(prefix, 'A column', column.field, declared);
        if (column.sortable !== true || sortable.includes(column.field)) continue;
        if (sortableColumns('entry').includes(column.field)) {
            throw new Error(
                `${prefix} is sortable, but a sort by "${column.field}" orders by the entry's own ` +
                    `\`${column.field}\` column, not the field the column shows. ` +
                    'Rename the field, or drop `sortable`.'
            );
        }
        throw new Error(
            `${prefix} is sortable, but a \`${field.type}\` field holds no single value ` +
                `a list can order by. Sortable fields: ${quoteNames(sortable)}.`
        );
    }
}

/**
 * Throw when a grid field names no top-level field of the type, since the
 * admin's grid view reads its value from the entry's `fields`, as a column
 * does, and would show nothing. `owner` names the type in the message.
 */
function assertGridFields(
    owner: string,
    gridFields: readonly { field: string }[],
    fields: ResolvedEntryFields
): void {
    const declared = flattenEntryFields(fields);
    for (const gridField of gridFields) {
        const prefix = `Astromech ${owner}: grid field "${gridField.field}"`;
        declaredField(prefix, 'A grid field', gridField.field, declared);
    }
}

/** The top-level field `name` names, or a throw that says the type has none. */
function declaredField(
    prefix: string,
    reader: string,
    name: string,
    declared: readonly DataField[]
): DataField {
    const field = declared.find((candidate) => candidate.name === name);
    if (field !== undefined) return field;
    throw new Error(
        `${prefix} shows a field, but the type declares no top-level field ` +
            `by that name. ${reader} reads the entry's \`fields\`, not its own ` +
            `columns such as \`title\` or \`slug\`. Fields: ${quoteNames(declared.map((f) => f.name))}.`
    );
}

function quoteNames(names: readonly string[]): string {
    return names.length > 0 ? names.map((name) => `"${name}"`).join(', ') : 'none';
}
