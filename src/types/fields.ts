/**
 * Field system types — field definitions, validation, groups
 */

import type { Entry } from './domain.js';

// ============================================================================
// Field Types
// ============================================================================

export const CORE_FIELD_TYPES = [
    'text',
    'textarea',
    'richtext',
    'number',
    'boolean',
    'date',
    'datetime',
    'select',
    'multiselect',
    'media',
    'relationship',
    'json',
    'group',
    'repeater',
    'blocks',
    'email',
    'url',
    'color',
    'slug',
    'range',
    'checkbox-group',
    'radio-group',
    'link',
    'key-value',
    'accordion',
    'tab',
] as const;

export type FieldType = (typeof CORE_FIELD_TYPES)[number];

/**
 * A field's `type` — a core type (autocompleted) or a plugin-registered
 * custom type. The intersection keeps literal autocomplete working.
 */
export type AnyFieldType = FieldType | (string & Record<never, never>);

export type SelectOption = {
    value: string;
    label: string;
};

export type BlockDefinition = {
    type: string;
    label: string;
    icon?: string;
    fields: FieldDefinition[];
};

export type ValidationRule =
    | { required: true }
    | { minLength: number }
    | { maxLength: number }
    | { min: number }
    | { max: number }
    | { pattern: string; message?: string }
    | { email: true }
    | { url: true }
    | { custom: (value: unknown, entry: Entry) => string | null };

export type FieldDefinition = {
    name: string;
    type: AnyFieldType;
    label?: string;
    required?: boolean;
    defaultValue?: unknown;
    description?: string;
    validation?: ValidationRule[];

    // Type-specific options
    options?: SelectOption[] | string[];
    target?: string;
    multiple?: boolean;
    inverse?: string;
    ordered?: boolean;
    onDelete?: 'cascade' | 'set-null' | 'restrict';
    fields?: FieldDefinition[];
    min?: number;
    max?: number;
    step?: number;
    checkboxLabel?: string;
    collapsed?: boolean;
    tab?: string;
    accept?: string;
    blocks?: BlockDefinition[];

    // Translation support
    translatable?: boolean;

    /**
     * Multi-type storage indexes this field for free-text search; collected
     * into the entry type's `search` list at resolve time.
     */
    searchable?: boolean;
};

/**
 * Base props for all field components
 */
export type BaseFieldProps = {
    name: string;
    value: unknown;
    field: FieldDefinition;
    required?: boolean;
    onChange: (name: string, value: unknown) => void;
    disabled?: boolean;
};

// ============================================================================
// Field Groups
// ============================================================================

export type FieldGroupPlacement = 'main' | 'sidebar' | 'tab';

export type FieldGroup = {
    name: string;
    label: string;
    /** Where the group renders on the edit page. `'tab'` adds it to the tab strip. */
    placement: FieldGroupPlacement;
    priority?: number;
    collapsed?: boolean;
    description?: string;
    fields: FieldDefinition[];
};
