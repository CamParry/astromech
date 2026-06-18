/**
 * Core field-type descriptors — one entry per data field type.
 *
 * Layout containers (section/tabs/tab/accordion) are intentionally excluded:
 * they emit no data and need no descriptor.
 *
 * `coerce` and `validate` are intentionally unpopulated here. They will be
 * filled in P2/P3 once the `coerce → default → validate` pipeline exists and
 * can consume them.
 */

import type { FieldTypeDescriptor } from '@/types/fields.js';
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

export const coreFieldTypeDescriptors: FieldTypeDescriptor[] = [
    {
        type: 'text',
        build: text,
        component: '@/admin/components/fields/text-field',
        tsType: () => 'string',
    },
    {
        type: 'textarea',
        build: textarea,
        component: '@/admin/components/fields/textarea-field',
        tsType: () => 'string',
    },
    {
        type: 'richtext',
        build: richtext,
        component: '@/admin/components/fields/richtext-field',
        tsType: (_field, shape) =>
            shape === 'public' ? 'string' : "import('astromech').JsonValue",
    },
    {
        type: 'number',
        build: number,
        component: '@/admin/components/fields/number-field',
        tsType: () => 'number',
    },
    {
        type: 'boolean',
        build: boolean,
        component: '@/admin/components/fields/boolean-field',
        tsType: () => 'boolean',
        defaultValue: false,
    },
    {
        type: 'date',
        build: date,
        component: '@/admin/components/fields/date-field',
        tsType: () => 'string',
    },
    {
        type: 'datetime',
        build: datetime,
        component: '@/admin/components/fields/datetime-field',
        tsType: () => 'string',
    },
    {
        type: 'select',
        build: select,
        component: '@/admin/components/fields/select-field',
        tsType: () => 'string',
    },
    {
        type: 'multiselect',
        build: multiselect,
        component: '@/admin/components/fields/multiselect-field',
        tsType: () => 'string[]',
        defaultValue: [],
    },
    {
        type: 'media',
        build: media,
        component: '@/admin/components/fields/media-field',
        tsType: (field) => (field.multiple === true ? 'string[]' : 'string'),
        isRelation: true,
    },
    {
        type: 'relationship',
        build: relationship,
        component: '@/admin/components/fields/relationship-field',
        tsType: (field) => (field.multiple === true ? 'string[]' : 'string'),
        isRelation: true,
    },
    {
        type: 'json',
        build: json,
        component: '@/admin/components/fields/json-field',
        tsType: () => "import('astromech').JsonValue",
    },
    {
        type: 'group',
        build: (name, options) => group(name, options as Parameters<typeof group>[1]),
        component: '@/admin/components/fields/group-field',
        tsType: () => null,
        isContainer: true,
    },
    {
        type: 'repeater',
        build: (name, options) => repeater(name, options as Parameters<typeof repeater>[1]),
        component: '@/admin/components/fields/repeater-field',
        tsType: () => null,
        defaultValue: [],
        reservedKeys: ['_id', '_disabled', '_title'],
        isContainer: true,
    },
    {
        type: 'blocks',
        build: (name, options) => blocks(name, options as Parameters<typeof blocks>[1]),
        component: '@/admin/components/fields/blocks-field',
        tsType: () => null,
        defaultValue: [],
        reservedKeys: ['_id', '_type', '_disabled', '_title'],
        isContainer: true,
    },
    {
        type: 'tree',
        build: (name, options) => tree(name, options as Parameters<typeof tree>[1]),
        component: '@/admin/components/fields/tree-field',
        tsType: () => null,
        defaultValue: [],
        reservedKeys: ['_id', '_disabled'],
        isContainer: true,
    },
    {
        type: 'email',
        build: email,
        component: '@/admin/components/fields/email-field',
        tsType: () => 'string',
    },
    {
        type: 'url',
        build: url,
        component: '@/admin/components/fields/url-field',
        tsType: () => 'string',
    },
    {
        type: 'color',
        build: color,
        component: '@/admin/components/fields/color-field',
        tsType: () => 'string',
    },
    {
        type: 'slug',
        build: slug,
        component: '@/admin/components/fields/slug-field',
        tsType: () => 'string',
    },
    {
        type: 'range',
        build: range,
        component: '@/admin/components/fields/range-field',
        tsType: () => 'number',
    },
    {
        type: 'checkbox-group',
        build: checkboxGroup,
        component: '@/admin/components/fields/checkbox-group-field',
        tsType: () => 'string[]',
        defaultValue: [],
    },
    {
        type: 'radio-group',
        build: radioGroup,
        component: '@/admin/components/fields/radio-group-field',
        tsType: () => 'string',
    },
    {
        type: 'link',
        build: link,
        component: '@/admin/components/fields/link-field',
        tsType: () => '{ url: string; label: string; target?: string }',
    },
    {
        type: 'key-value',
        build: keyValue,
        component: '@/admin/components/fields/key-value-field',
        tsType: () => 'Record<string, string>',
    },
];
