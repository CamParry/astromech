/**
 * Core field-type descriptors — one entry per data-bearing field type.
 *
 * Layout fields are intentionally excluded: they emit no data and need no
 * descriptor. The nested fields additionally fill the `children` slot, which
 * normalizes the stored value and reports the nested value scopes inside it —
 * how the pipeline recurses without switching on field type. `TERMINOLOGY.md`
 * states the two categories and their membership.
 */

import type {
    ContainerScope,
    FieldDefinition,
    FieldPathSegment,
    FieldTypeDescriptor,
    FieldValidator,
} from '@/types/fields.js';
import { RESERVED_KEY } from './reserved-keys.js';
import {
    coerceEmail,
    validateEmail,
    coerceUrl,
    validateUrl,
    coerceSlug,
    validateJson,
    coerceKeyValue,
    validateKeyValue,
    validateChoice,
    validateMultiChoice,
    coerceNumber,
    validateNumber,
    validateBoolean,
    coerceDate,
    validateDate,
    validateReference,
    validateText,
    validateLink,
    validateGroup,
    validateItemList,
} from './built-in-rules.js';
import { coerceRichText, validateRichText } from './rich-text/validate.js';
import {
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
    blocks,
    url,
} from '@/fields/builder.js';

// ---------------------------------------------------------------------------
// Container children — normalization + scope discovery
// ---------------------------------------------------------------------------

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
    field: FieldDefinition,
    value: unknown,
    definitionsFor: (item: Record<string, unknown>) => FieldDefinition[] | null
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
    field: FieldDefinition,
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

export const coreFieldTypeDescriptors: FieldTypeDescriptor[] = [
    {
        type: 'text',
        build: text,
        component: '@/admin/components/fields/text-field',
        validate: validateText,
        tsType: () => 'string',
    },
    {
        type: 'textarea',
        build: textarea,
        component: '@/admin/components/fields/textarea-field',
        validate: validateText,
        tsType: () => 'string',
    },
    {
        type: 'richtext',
        build: richtext,
        component: '@/admin/components/fields/richtext-field',
        coerce: coerceRichText,
        validate: validateRichText,
        tsType: (_field, shape) =>
            shape === 'public' ? 'string' : "import('astromech').JsonValue",
    },
    {
        type: 'number',
        build: number,
        component: '@/admin/components/fields/number-field',
        coerce: coerceNumber,
        validate: validateNumber,
        tsType: () => 'number',
    },
    {
        type: 'boolean',
        build: boolean,
        component: '@/admin/components/fields/boolean-field',
        validate: validateBoolean,
        tsType: () => 'boolean',
        defaultValue: false,
    },
    {
        type: 'date',
        build: date,
        component: '@/admin/components/fields/date-field',
        coerce: coerceDate,
        validate: validateDate,
        tsType: () => 'string',
    },
    {
        type: 'datetime',
        build: datetime,
        component: '@/admin/components/fields/datetime-field',
        coerce: coerceDate,
        validate: validateDate,
        tsType: () => 'string',
    },
    {
        type: 'select',
        build: select,
        component: '@/admin/components/fields/select-field',
        validate: validateChoice,
        tsType: () => 'string',
    },
    {
        type: 'multiselect',
        build: multiselect,
        component: '@/admin/components/fields/multiselect-field',
        validate: validateMultiChoice,
        tsType: () => 'string[]',
        defaultValue: [],
    },
    {
        type: 'media',
        build: media,
        component: '@/admin/components/fields/media-field',
        validate: validateReference,
        tsType: (field) => (field.multiple === true ? 'string[]' : 'string'),
        isRelation: true,
    },
    {
        type: 'relationship',
        build: relationship,
        component: '@/admin/components/fields/relationship-field',
        validate: validateReference,
        tsType: (field) => (field.multiple === true ? 'string[]' : 'string'),
        isRelation: true,
    },
    {
        type: 'json',
        build: json,
        component: '@/admin/components/fields/json-field',
        tsType: () => "import('astromech').JsonValue",
        validate: validateJson,
    },
    {
        type: 'group',
        build: (name, options) => group(name, options as Parameters<typeof group>[1]),
        component: '@/admin/components/fields/group-field',
        validate: validateGroup,
        tsType: () => null,
        isContainer: true,
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
        component: '@/admin/components/fields/repeater-field',
        validate: validateItemList,
        tsType: () => null,
        defaultValue: [],
        reservedKeys: [RESERVED_KEY.id, RESERVED_KEY.disabled, RESERVED_KEY.title],
        isContainer: true,
        children: (field, value) => arrayChildren(field, value, () => field.fields ?? []),
    },
    {
        type: 'blocks',
        build: (name, options) => blocks(name, options as Parameters<typeof blocks>[1]),
        component: '@/admin/components/fields/blocks-field',
        tsType: () => null,
        defaultValue: [],
        reservedKeys: [
            RESERVED_KEY.id,
            RESERVED_KEY.type,
            RESERVED_KEY.disabled,
            RESERVED_KEY.title,
        ],
        isContainer: true,
        validate: validateBlockTypes,
        children: (field, value) =>
            arrayChildren(field, value, (item) => {
                const block = field.blocks?.find(
                    (candidate) => candidate.type === item[RESERVED_KEY.type]
                );
                return block === undefined ? null : (block.fields ?? []);
            }),
    },
    {
        type: 'tree',
        build: (name, options) => tree(name, options as Parameters<typeof tree>[1]),
        component: '@/admin/components/fields/tree-field',
        validate: validateItemList,
        tsType: () => null,
        defaultValue: [],
        reservedKeys: [RESERVED_KEY.id, RESERVED_KEY.disabled],
        isContainer: true,
        children: treeChildren,
    },
    {
        type: 'email',
        build: email,
        component: '@/admin/components/fields/email-field',
        tsType: () => 'string',
        coerce: coerceEmail,
        validate: validateEmail,
    },
    {
        type: 'url',
        build: url,
        component: '@/admin/components/fields/url-field',
        tsType: () => 'string',
        coerce: coerceUrl,
        validate: validateUrl,
    },
    {
        type: 'color',
        build: color,
        component: '@/admin/components/fields/color-field',
        validate: validateText,
        tsType: () => 'string',
    },
    {
        type: 'slug',
        build: slug,
        component: '@/admin/components/fields/slug-field',
        validate: validateText,
        tsType: () => 'string',
        coerce: coerceSlug,
    },
    {
        type: 'range',
        build: range,
        component: '@/admin/components/fields/range-field',
        coerce: coerceNumber,
        validate: validateNumber,
        tsType: () => 'number',
    },
    {
        type: 'checkbox-group',
        build: checkboxGroup,
        component: '@/admin/components/fields/checkbox-group-field',
        validate: validateMultiChoice,
        tsType: () => 'string[]',
        defaultValue: [],
    },
    {
        type: 'radio-group',
        build: radioGroup,
        component: '@/admin/components/fields/radio-group-field',
        validate: validateChoice,
        tsType: () => 'string',
    },
    {
        type: 'link',
        build: link,
        component: '@/admin/components/fields/link-field',
        validate: validateLink,
        tsType: () => '{ url: string; label: string; target?: string }',
    },
    {
        type: 'key-value',
        build: keyValue,
        component: '@/admin/components/fields/key-value-field',
        tsType: () => 'Record<string, string>',
        coerce: coerceKeyValue,
        validate: validateKeyValue,
    },
];
