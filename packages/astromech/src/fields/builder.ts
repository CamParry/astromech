/**
 * Field factories — pure functions returning plain `Field` POJOs. A positional
 * name is always a data key: a structural field given one nests its children
 * under it, and without one it is a layout field that stores nothing.
 */

import type {
    Block,
    DataField,
    Field,
    Label,
    LayoutField,
    RichTextAllow,
    SelectOption,
    ValidationRule,
} from '@/types/fields';
import { fieldNameToLabel, t } from '@/utilities/labels';

// Re-exported so `astromech/fields` surfaces the `t` label descriptor.
export { t };

type BaseOptions = {
    label?: Label;
    required?: boolean;
    defaultValue?: unknown;
    description?: Label;
    validation?: ValidationRule[];
    translatable?: boolean;
    /** When true, this field is omitted from `public`-shape reads. Default: false (public). */
    private?: boolean;
};

type TextOptions = BaseOptions & {
    count?: boolean | { min?: number; max?: number };
    maxLength?: number;
};
type NumericOptions = BaseOptions & { min?: number; max?: number; step?: number };
type ChoiceOptions = BaseOptions & { options?: SelectOption[] | string[] };
type MediaOptions = BaseOptions & { multiple?: boolean; accept?: string };
type RelationshipOptions = BaseOptions & {
    target?: string;
    multiple?: boolean;
};

export type GroupOptions = BaseOptions & { boxed?: boolean; fields: Field[] };
type LayoutGroupOptions = {
    label?: Label;
    description?: Label;
    boxed?: boolean;
    private?: boolean;
    fields: Field[];
};
type RepeaterOptions = BaseOptions & {
    min?: number;
    max?: number;
    fields: Field[];
};
type TreeOptions = BaseOptions & {
    min?: number;
    max?: number;
    maxDepth?: number;
    fields: Field[];
};
type BlocksOptions = BaseOptions & { blocks: Block[] };
type BlockOptions = { label?: Label; fields: Field[] };

type AccordionOptions = {
    label?: Label;
    description?: Label;
    collapsed?: boolean;
    private?: boolean;
    fields: Field[];
};
type TabOptions = {
    label?: Label;
    description?: Label;
    private?: boolean;
    fields: Field[];
};
type TabsOptions = { private?: boolean; fields: Field[] };

export function text(name: string, options?: TextOptions): DataField {
    return { name, type: 'text', ...options };
}

export function textarea(name: string, options?: TextOptions): DataField {
    return { name, type: 'textarea', ...options };
}

type RichTextOptions = BaseOptions & {
    /** Subset of rich-text features to enable. All on by default. */
    allow?: RichTextAllow;
};

export function richtext(name: string, options?: RichTextOptions): DataField {
    return { name, type: 'richtext', ...options };
}

export function email(name: string, options?: BaseOptions): DataField {
    return { name, type: 'email', ...options };
}

export function url(name: string, options?: BaseOptions): DataField {
    return { name, type: 'url', ...options };
}

export function slug(name: string, options?: BaseOptions): DataField {
    return { name, type: 'slug', ...options };
}

export function color(name: string, options?: BaseOptions): DataField {
    return { name, type: 'color', ...options };
}

export function date(name: string, options?: BaseOptions): DataField {
    return { name, type: 'date', ...options };
}

export function datetime(name: string, options?: BaseOptions): DataField {
    return { name, type: 'datetime', ...options };
}

export function json(name: string, options?: BaseOptions): DataField {
    return { name, type: 'json', ...options };
}

export function link(name: string, options?: BaseOptions): DataField {
    return { name, type: 'link', ...options };
}

export function keyValue(name: string, options?: BaseOptions): DataField {
    return { name, type: 'key-value', ...options };
}

export function number(name: string, options?: NumericOptions): DataField {
    return { name, type: 'number', ...options };
}

export function range(name: string, options?: NumericOptions): DataField {
    return { name, type: 'range', ...options };
}

export function boolean(name: string, options?: BaseOptions): DataField {
    return { name, type: 'boolean', ...options };
}

export function select(name: string, options?: ChoiceOptions): DataField {
    return { name, type: 'select', ...options };
}

export function multiselect(name: string, options?: ChoiceOptions): DataField {
    return { name, type: 'multiselect', ...options };
}

export function radioGroup(name: string, options?: ChoiceOptions): DataField {
    return { name, type: 'radio-group', ...options };
}

export function checkboxGroup(name: string, options?: ChoiceOptions): DataField {
    return { name, type: 'checkbox-group', ...options };
}

export function media(name: string, options?: MediaOptions): DataField {
    return { name, type: 'media', ...options };
}

export function relationship(name: string, options?: RelationshipOptions): DataField {
    return { name, type: 'relationship', ...options };
}

/** A named group nests its fields under `name`; an unnamed one only draws a box. */
export function group(name: string, options: GroupOptions): DataField;
export function group(options: LayoutGroupOptions): LayoutField;
export function group(
    nameOrOptions: string | LayoutGroupOptions,
    namedOptions?: GroupOptions
): Field {
    if (typeof nameOrOptions !== 'string') {
        const { fields, ...rest } = nameOrOptions;
        return { type: 'group', ...rest, fields };
    }
    const { fields, ...rest } = namedOptions ?? { fields: [] };
    return { name: nameOrOptions, type: 'group', ...rest, fields };
}

export function repeater(name: string, options: RepeaterOptions): DataField {
    const { fields, ...rest } = options;
    return { name, type: 'repeater', ...rest, fields };
}

export function tree(name: string, options: TreeOptions): DataField {
    const { fields, ...rest } = options;
    return { name, type: 'tree', ...rest, fields };
}

export function blocks(name: string, options: BlocksOptions): DataField {
    const { blocks: blockDefs, ...rest } = options;
    return { name, type: 'blocks', ...rest, blocks: blockDefs };
}

export function block(type: string, options: BlockOptions): Block {
    return { type, ...options };
}

/** A named accordion nests its fields under `name`; an unnamed one needs a `label`. */
export function accordion(name: string, options: AccordionOptions): LayoutField;
export function accordion(options: AccordionOptions & { label: Label }): LayoutField;
export function accordion(
    nameOrOptions: string | AccordionOptions,
    namedOptions?: AccordionOptions
): LayoutField {
    return wrapLayout('accordion', nameOrOptions, namedOptions);
}

/** A named tab nests its fields under `name`; an unnamed one needs a `label`. */
export function tab(name: string, options: TabOptions): LayoutField;
export function tab(options: TabOptions & { label: Label }): LayoutField;
export function tab(
    nameOrOptions: string | TabOptions,
    namedOptions?: TabOptions
): LayoutField {
    return wrapLayout('tab', nameOrOptions, namedOptions);
}

/** A row of tabs. Never named: each `tab` decides whether its fields nest. */
export function tabs(options: TabsOptions): LayoutField {
    const { fields, ...rest } = options;
    return { type: 'tabs', ...rest, fields };
}

/**
 * Build an accordion or tab. A named one wraps an unboxed `group` carrying the
 * name, so `group` stays the only structural field that nests data.
 */
function wrapLayout(
    type: 'accordion' | 'tab',
    nameOrOptions: string | AccordionOptions | TabOptions,
    namedOptions: AccordionOptions | TabOptions | undefined
): LayoutField {
    if (typeof nameOrOptions !== 'string') {
        const { fields, ...rest } = nameOrOptions;
        return { type, ...rest, fields };
    }
    const { fields, label, ...rest } = namedOptions ?? { fields: [] };
    const nested: DataField = {
        name: nameOrOptions,
        type: 'group',
        boxed: false,
        ...(label !== undefined ? { label } : {}),
        fields,
    };
    return {
        type,
        label: label ?? fieldNameToLabel(nameOrOptions),
        ...rest,
        fields: [nested],
    };
}
