/**
 * Core field types. Nested types fill `children` (the scopes inside a value) and
 * `subFields` (the scopes a definition declares); `tabs`, `tab` and `accordion`
 * are layout-only and store nothing.
 */

import type { GroupOptions } from '@/fields/builder';
import type {
    ContainerScope,
    DataField,
    Field,
    FieldPathSegment,
    FieldType,
    FieldValidator,
    SubFields,
    TsTypeEmit,
} from '@/types/fields';
import type { JSONContent } from '@tiptap/core';
import {
    blocks,
    boolean,
    checkboxGroup,
    color,
    date,
    datetime,
    email,
    group,
    json,
    keyValue,
    link,
    media,
    multiselect,
    number,
    radioGroup,
    range,
    relationship,
    repeater,
    richtext,
    select,
    slug,
    text,
    textarea,
    tree,
    url,
} from '@/fields/builder';
import {
    coerceDate,
    coerceEmail,
    coerceKeyValue,
    coerceNumber,
    coerceUrl,
    validateBoolean,
    validateChoice,
    validateColor,
    validateDate,
    validateEmail,
    validateGroup,
    validateItemList,
    validateJson,
    validateKeyValue,
    validateLink,
    validateMultiChoice,
    validateNumber,
    validateReference,
    validateSlug,
    validateText,
    validateUrl,
} from './built-in-rules';
import { RESERVED_KEY, RESERVED_KEY_META } from './reserved-keys';
import { renderRichText } from './rich-text/render';
import { coerceRichText, validateRichText } from './rich-text/validate';

// Container children — normalization + scope discovery

/**
 * Guard against a pathological (or hostile) `tree` value recursing deeply enough
 * to blow the stack. Nodes below the cap are left as-is and get no scope.
 */
const MAX_TREE_DEPTH = 50;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Shallow-clone an item and guarantee it carries a stable `_id`. */
function cloneWithId(item: Record<string, unknown>): {
    item: Record<string, unknown>;
    id: string;
} {
    const clone = { ...item };
    const existing = clone[RESERVED_KEY.id];
    const id =
        typeof existing === 'string' && existing !== '' ? existing : crypto.randomUUID();
    clone[RESERVED_KEY.id] = id;
    return { item: clone, id };
}

/**
 * Shared `children` body for the array-shaped containers (`repeater`/`blocks`).
 * `definitionsFor` returns the definitions that govern an item, or `null` when
 * the item has no schema to validate against (an undeclared block `_type`) — it
 * is still normalized into `next`, it just gets no scope.
 */
function arrayChildren(
    field: DataField,
    value: unknown,
    definitionsFor: (item: Record<string, unknown>) => Field[] | null
): { next: unknown; scopes: ContainerScope[] } {
    if (!Array.isArray(value)) return { next: [], scopes: [] };

    const fieldSegment: FieldPathSegment = { kind: 'field', name: field.name };
    const next: unknown[] = [];
    const scopes: ContainerScope[] = [];

    for (const raw of value) {
        // A non-object item can hold no fields; pass it through untouched rather
        // than rewriting it into `{ _id }` and losing whatever was there.
        if (!isPlainObject(raw)) {
            next.push(raw);
            continue;
        }
        const { item, id } = cloneWithId(raw);
        next.push(item);
        const definitions = definitionsFor(item);
        if (definitions !== null) {
            scopes.push({
                segments: [fieldSegment, { kind: 'item', id }],
                definitions,
                values: item,
            });
        }
    }

    return { next, scopes };
}

/**
 * `tree` children — one scope per node at EVERY depth, flattened. `_children` is
 * never a path segment: node ids are unique tree-wide, so depth never appears in
 * a path.
 */
function treeChildren(
    field: DataField,
    value: unknown
): { next: unknown; scopes: ContainerScope[] } {
    if (!Array.isArray(value)) return { next: [], scopes: [] };

    const fieldSegment: FieldPathSegment = { kind: 'field', name: field.name };
    const scopes: ContainerScope[] = [];

    function walk(nodes: unknown[], depth: number): unknown[] {
        const out: unknown[] = [];
        for (const raw of nodes) {
            if (!isPlainObject(raw)) {
                out.push(raw);
                continue;
            }
            const { item, id } = cloneWithId(raw);
            const nested = item[RESERVED_KEY.children];
            if (Array.isArray(nested) && depth < MAX_TREE_DEPTH) {
                item[RESERVED_KEY.children] = walk(nested, depth + 1);
            }
            out.push(item);
            scopes.push({
                segments: [fieldSegment, { kind: 'item', id }],
                definitions: field.fields ?? [],
                values: item,
            });
        }
        return out;
    }

    return { next: walk(value, 1), scopes };
}

/**
 * A block instance whose `_type` matches no declared block gets no scope from
 * `children`, so its contents would otherwise pass unvalidated. Flag it on the
 * container's own path instead of letting it through silently.
 */
const validateBlockTypes: FieldValidator = async (ctx) => {
    if (!Array.isArray(ctx.value)) return 'Must be a list of items';
    const declared = new Set((ctx.field.blocks ?? []).map((block) => block.type));
    const unknownTypes: string[] = [];
    for (const item of ctx.value) {
        if (!isPlainObject(item)) continue;
        const type = item[RESERVED_KEY.type];
        const label = typeof type === 'string' ? type : String(type);
        if (!declared.has(label) && !unknownTypes.includes(label)) {
            unknownTypes.push(label);
        }
    }
    return unknownTypes.length === 0
        ? true
        : `Unknown block type: ${unknownTypes.join(', ')}`;
};

/** A core type that stores data: each has a builder, a TS type and its own check. */
type CoreDataFieldType = FieldType &
    Required<Pick<FieldType, 'build' | 'tsType' | 'validate'>>;

const REPEATER_KEYS = [RESERVED_KEY.id, RESERVED_KEY.disabled, RESERVED_KEY.title];
const BLOCKS_KEYS = [
    RESERVED_KEY.id,
    RESERVED_KEY.type,
    RESERVED_KEY.disabled,
    RESERVED_KEY.title,
];
const TREE_KEYS = [RESERVED_KEY.id, RESERVED_KEY.disabled];

/** The TS lines for a container's reserved item keys, in the given shape. */
function reservedKeyLines(keys: readonly string[], shape: 'full' | 'public'): string[] {
    return keys.flatMap((key) => {
        const meta = RESERVED_KEY_META[key];
        if (meta === undefined || (shape === 'public' && !meta.inPublic)) return [];
        return [meta.tsLine];
    });
}

/** An object type literal from property lines. */
function objectType(lines: string[]): string {
    return lines.length === 0 ? '{}' : `{\n${lines.map((l) => `  ${l}`).join('\n')}\n}`;
}

/** The item type of a `repeater`: its reserved keys, then its fields. */
function repeaterType(
    field: DataField,
    shape: 'full' | 'public',
    emit: TsTypeEmit
): string {
    const lines = [
        ...reservedKeyLines(REPEATER_KEYS, shape),
        ...emit.properties(field.fields ?? []),
    ];
    return `Array<${objectType(lines)}>`;
}

/** A `tree` node refers to itself, so it is a named type. */
function treeType(field: DataField, shape: 'full' | 'public', emit: TsTypeEmit): string {
    const suffix = shape === 'public' ? 'PublicTreeNode' : 'TreeNode';
    const name = emit.alias(`${field.name}${suffix}`, (self) =>
        objectType([
            ...reservedKeyLines(TREE_KEYS, shape),
            ...emit.properties(field.fields ?? []),
            `${RESERVED_KEY.children}?: ${self}[];`,
        ])
    );
    return `${name}[]`;
}

/** The one scope a `group`, `repeater` or `tree` declares. */
function ownFields(repeats: boolean): (field: DataField) => SubFields[] {
    return (field) => [{ fields: field.fields ?? [], repeats }];
}

const dataFieldTypes: CoreDataFieldType[] = [
    {
        type: 'text',
        build: text,
        validate: validateText,
        tsType: () => 'string',
    },
    {
        type: 'textarea',
        build: textarea,
        validate: validateText,
        tsType: () => 'string',
    },
    {
        type: 'richtext',
        build: richtext,
        coerce: coerceRichText,
        validate: validateRichText,
        toPublic: (field, value) =>
            renderRichText(value as JSONContent | null | undefined, field.allow),
        tsType: (_field, shape) =>
            shape === 'public' ? 'string' : "import('astromech').JsonValue",
    },
    {
        type: 'number',
        build: number,
        coerce: coerceNumber,
        validate: validateNumber,
        tsType: () => 'number',
    },
    {
        type: 'boolean',
        build: boolean,
        validate: validateBoolean,
        tsType: () => 'boolean',
        defaultValue: false,
    },
    {
        type: 'date',
        build: date,
        coerce: coerceDate,
        validate: validateDate,
        tsType: () => 'string',
    },
    {
        type: 'datetime',
        build: datetime,
        coerce: coerceDate,
        validate: validateDate,
        tsType: () => 'string',
    },
    {
        type: 'select',
        build: select,
        validate: validateChoice,
        tsType: () => 'string',
    },
    {
        type: 'multiselect',
        build: multiselect,
        validate: validateMultiChoice,
        tsType: () => 'string[]',
        defaultValue: [],
    },
    {
        type: 'media',
        build: media,
        validate: validateReference,
        tsType: (field) => (field.multiple === true ? 'string[]' : 'string'),
        isRelation: true,
    },
    {
        type: 'relationship',
        build: relationship,
        validate: validateReference,
        tsType: (field) => (field.multiple === true ? 'string[]' : 'string'),
        isRelation: true,
    },
    {
        type: 'json',
        build: json,
        tsType: () => "import('astromech').JsonValue",
        validate: validateJson,
    },
    {
        type: 'group',
        build: (name, options) => group(name, options as GroupOptions),
        validate: validateGroup,
        tsType: (field, _shape, emit) => objectType(emit.properties(field.fields ?? [])),
        layout: true,
        subFields: ownFields(false),
        children: (field, value) => {
            const next = { ...(isPlainObject(value) ? value : {}) };
            return {
                next,
                scopes: [
                    {
                        segments: [{ kind: 'field', name: field.name }],
                        definitions: field.fields ?? [],
                        values: next,
                    },
                ],
            };
        },
    },
    {
        type: 'repeater',
        build: (name, options) =>
            repeater(name, options as Parameters<typeof repeater>[1]),
        validate: validateItemList,
        tsType: repeaterType,
        defaultValue: [],
        children: (field, value) => arrayChildren(field, value, () => field.fields ?? []),
        subFields: ownFields(true),
    },
    {
        type: 'blocks',
        build: (name, options) => blocks(name, options as Parameters<typeof blocks>[1]),
        // `JsonObject` is intersected rather than given an index signature, which
        // would admit `undefined` and stop the item being a `JsonObject`.
        tsType: (_field, shape) =>
            `Array<import('astromech').JsonObject & { ${reservedKeyLines(BLOCKS_KEYS, shape).join(' ')} }>`,
        defaultValue: [],
        validate: validateBlockTypes,
        children: (field, value) =>
            arrayChildren(field, value, (item) => {
                const block = field.blocks?.find(
                    (candidate) => candidate.type === item[RESERVED_KEY.type]
                );
                return block === undefined ? null : (block.fields ?? []);
            }),
        subFields: (field) =>
            (field.blocks ?? []).map((block) => ({
                fields: block.fields ?? [],
                repeats: true,
            })),
    },
    {
        type: 'tree',
        build: (name, options) => tree(name, options as Parameters<typeof tree>[1]),
        validate: validateItemList,
        tsType: treeType,
        defaultValue: [],
        children: treeChildren,
        subFields: ownFields(true),
    },
    {
        type: 'email',
        build: email,
        tsType: () => 'string',
        coerce: coerceEmail,
        validate: validateEmail,
    },
    {
        type: 'url',
        build: url,
        tsType: () => 'string',
        coerce: coerceUrl,
        validate: validateUrl,
    },
    {
        type: 'color',
        build: color,
        validate: validateColor,
        tsType: () => 'string',
    },
    {
        type: 'slug',
        build: slug,
        validate: validateSlug,
        tsType: () => 'string',
    },
    {
        type: 'range',
        build: range,
        coerce: coerceNumber,
        validate: validateNumber,
        tsType: () => 'number',
    },
    {
        type: 'checkbox-group',
        build: checkboxGroup,
        validate: validateMultiChoice,
        tsType: () => 'string[]',
        defaultValue: [],
    },
    {
        type: 'radio-group',
        build: radioGroup,
        validate: validateChoice,
        tsType: () => 'string',
    },
    {
        type: 'link',
        build: link,
        validate: validateLink,
        tsType: () => '{ url: string; label: string; target?: string }',
    },
    {
        type: 'key-value',
        build: keyValue,
        tsType: () => 'Record<string, string>',
        coerce: coerceKeyValue,
        validate: validateKeyValue,
    },
];

/** Layout-only types: they draw a surface, store nothing, and never take a name. */
const layoutFieldTypes: FieldType[] = ['tabs', 'tab', 'accordion'].map((type) => ({
    type,
    layout: true,
    affectsData: false,
}));

export const coreFieldTypes: FieldType[] = [...dataFieldTypes, ...layoutFieldTypes];
