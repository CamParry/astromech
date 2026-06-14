/**
 * Field factories — pure functions returning plain `FieldDefinition` POJOs (no
 * builder class, chaining, or overloads). Uniform shape `type(name, options?)`,
 * with container children in `options.fields` (or `options.blocks`).
 *
 * For chrome containers (`section`/`accordion`/`tab`) the name is inert — never a
 * data key — and `label` is optional: when omitted the renderer derives the title
 * from the name, like an unlabelled leaf.
 */

import type {
    BlockDefinition,
    FieldDefinition,
    Label,
    SelectOption,
    ValidationRule,
} from '@/types/fields.js';
import { t } from '@/support/labels.js';

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
};

type NumericOptions = BaseOptions & { min?: number; max?: number; step?: number };
type ChoiceOptions = BaseOptions & { options?: SelectOption[] | string[] };
type MediaOptions = BaseOptions & { multiple?: boolean; accept?: string };
type RelationshipOptions = BaseOptions & {
    target?: string;
    multiple?: boolean;
    inverse?: string;
    ordered?: boolean;
    onDelete?: 'cascade' | 'set-null' | 'restrict';
};

type GroupOptions = BaseOptions & { fields: FieldDefinition[] };
type RepeaterOptions = BaseOptions & {
    min?: number;
    max?: number;
    fields: FieldDefinition[];
};
type BlocksOptions = BaseOptions & { blocks: BlockDefinition[] };
type BlockOptions = { label?: Label; icon?: string; fields: FieldDefinition[] };

type SectionOptions = { label?: Label; description?: Label; fields: FieldDefinition[] };
type AccordionOptions = {
    label?: Label;
    description?: Label;
    collapsed?: boolean;
    fields: FieldDefinition[];
};
type TabOptions = { label?: Label; description?: Label; fields: FieldDefinition[] };
type TabsOptions = { fields: FieldDefinition[] };

export function text(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'text', ...options };
}

export function textarea(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'textarea', ...options };
}

export function richtext(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'richtext', ...options };
}

export function email(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'email', ...options };
}

export function url(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'url', ...options };
}

export function slug(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'slug', ...options };
}

export function color(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'color', ...options };
}

export function date(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'date', ...options };
}

export function datetime(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'datetime', ...options };
}

export function json(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'json', ...options };
}

export function link(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'link', ...options };
}

export function keyValue(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'key-value', ...options };
}

export function number(name: string, options?: NumericOptions): FieldDefinition {
    return { name, type: 'number', ...options };
}

export function range(name: string, options?: NumericOptions): FieldDefinition {
    return { name, type: 'range', ...options };
}

export function boolean(name: string, options?: BaseOptions): FieldDefinition {
    return { name, type: 'boolean', ...options };
}

export function select(name: string, options?: ChoiceOptions): FieldDefinition {
    return { name, type: 'select', ...options };
}

export function multiselect(name: string, options?: ChoiceOptions): FieldDefinition {
    return { name, type: 'multiselect', ...options };
}

export function radioGroup(name: string, options?: ChoiceOptions): FieldDefinition {
    return { name, type: 'radio-group', ...options };
}

export function checkboxGroup(name: string, options?: ChoiceOptions): FieldDefinition {
    return { name, type: 'checkbox-group', ...options };
}

export function media(name: string, options?: MediaOptions): FieldDefinition {
    return { name, type: 'media', ...options };
}

export function relationship(
    name: string,
    options?: RelationshipOptions
): FieldDefinition {
    return { name, type: 'relationship', ...options };
}

export function group(name: string, options: GroupOptions): FieldDefinition {
    const { fields, ...rest } = options;
    return { name, type: 'group', ...rest, fields };
}

export function repeater(name: string, options: RepeaterOptions): FieldDefinition {
    const { fields, ...rest } = options;
    return { name, type: 'repeater', ...rest, fields };
}

export function blocks(name: string, options: BlocksOptions): FieldDefinition {
    const { blocks: blockDefs, ...rest } = options;
    return { name, type: 'blocks', ...rest, blocks: blockDefs };
}

export function block(type: string, options: BlockOptions): BlockDefinition {
    return { type, ...options };
}

export function section(name: string, options: SectionOptions): FieldDefinition {
    const { fields, ...rest } = options;
    return { name, type: 'section', ...rest, fields };
}

export function accordion(name: string, options: AccordionOptions): FieldDefinition {
    const { fields, ...rest } = options;
    return { name, type: 'accordion', ...rest, fields };
}

export function tab(name: string, options: TabOptions): FieldDefinition {
    const { fields, ...rest } = options;
    return { name, type: 'tab', ...rest, fields };
}

export function tabs(options: TabsOptions): FieldDefinition {
    return { name: 'tabs', type: 'tabs', fields: options.fields };
}
