/**
 * Field factories — pure functions returning plain `Field` POJOs (no builder
 * class, chaining, or overloads), uniform shape `type(name, options?)`. A
 * layout field's name is inert; `label` defaults to a title derived from it.
 */

import type {
    Block,
    Field,
    Label,
    RichTextAllow,
    SelectOption,
    ValidationRule,
} from '@/types/fields';
import { t } from '@/utilities/labels';

// Re-exported so `astromech/fields` surfaces the `t` label descriptor.
export { t };

type BaseOptions = {
    label?: Label;
    required?: boolean;
    defaultValue?: unknown;
    description?: Label;
    validation?: ValidationRule[];
    translatable?: boolean;
    searchable?: boolean;
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

type GroupOptions = BaseOptions & { boxed?: boolean; fields: Field[] };
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

type SectionOptions = {
    label?: Label;
    description?: Label;
    private?: boolean;
    fields: Field[];
};
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

export function text(name: string, options?: TextOptions): Field {
    return { name, type: 'text', ...options };
}

export function textarea(name: string, options?: TextOptions): Field {
    return { name, type: 'textarea', ...options };
}

type RichTextOptions = BaseOptions & {
    /** Subset of rich-text features to enable. All on by default. */
    allow?: RichTextAllow;
};

export function richtext(name: string, options?: RichTextOptions): Field {
    return { name, type: 'richtext', ...options };
}

export function email(name: string, options?: BaseOptions): Field {
    return { name, type: 'email', ...options };
}

export function url(name: string, options?: BaseOptions): Field {
    return { name, type: 'url', ...options };
}

export function slug(name: string, options?: BaseOptions): Field {
    return { name, type: 'slug', ...options };
}

export function color(name: string, options?: BaseOptions): Field {
    return { name, type: 'color', ...options };
}

export function date(name: string, options?: BaseOptions): Field {
    return { name, type: 'date', ...options };
}

export function datetime(name: string, options?: BaseOptions): Field {
    return { name, type: 'datetime', ...options };
}

export function json(name: string, options?: BaseOptions): Field {
    return { name, type: 'json', ...options };
}

export function link(name: string, options?: BaseOptions): Field {
    return { name, type: 'link', ...options };
}

export function keyValue(name: string, options?: BaseOptions): Field {
    return { name, type: 'key-value', ...options };
}

export function number(name: string, options?: NumericOptions): Field {
    return { name, type: 'number', ...options };
}

export function range(name: string, options?: NumericOptions): Field {
    return { name, type: 'range', ...options };
}

export function boolean(name: string, options?: BaseOptions): Field {
    return { name, type: 'boolean', ...options };
}

export function select(name: string, options?: ChoiceOptions): Field {
    return { name, type: 'select', ...options };
}

export function multiselect(name: string, options?: ChoiceOptions): Field {
    return { name, type: 'multiselect', ...options };
}

export function radioGroup(name: string, options?: ChoiceOptions): Field {
    return { name, type: 'radio-group', ...options };
}

export function checkboxGroup(name: string, options?: ChoiceOptions): Field {
    return { name, type: 'checkbox-group', ...options };
}

export function media(name: string, options?: MediaOptions): Field {
    return { name, type: 'media', ...options };
}

export function relationship(name: string, options?: RelationshipOptions): Field {
    return { name, type: 'relationship', ...options };
}

export function group(name: string, options: GroupOptions): Field {
    const { fields, ...rest } = options;
    return { name, type: 'group', ...rest, fields };
}

export function repeater(name: string, options: RepeaterOptions): Field {
    const { fields, ...rest } = options;
    return { name, type: 'repeater', ...rest, fields };
}

export function tree(name: string, options: TreeOptions): Field {
    const { fields, ...rest } = options;
    return { name, type: 'tree', ...rest, fields };
}

export function blocks(name: string, options: BlocksOptions): Field {
    const { blocks: blockDefs, ...rest } = options;
    return { name, type: 'blocks', ...rest, blocks: blockDefs };
}

export function block(type: string, options: BlockOptions): Block {
    return { type, ...options };
}

export function section(name: string, options: SectionOptions): Field {
    const { fields, ...rest } = options;
    return { name, type: 'section', ...rest, fields };
}

export function accordion(name: string, options: AccordionOptions): Field {
    const { fields, ...rest } = options;
    return { name, type: 'accordion', ...rest, fields };
}

export function tab(name: string, options: TabOptions): Field {
    const { fields, ...rest } = options;
    return { name, type: 'tab', ...rest, fields };
}

export function tabs(options: TabsOptions): Field {
    const { fields, ...rest } = options;
    return { name: 'tabs', type: 'tabs', ...rest, fields };
}
