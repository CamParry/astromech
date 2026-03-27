/**
 * Field system types — field definitions, validation, groups
 */

import type { Entry } from './domain.js';

// ============================================================================
// Field Types
// ============================================================================

export type FieldType =
    | 'text'
    | 'textarea'
    | 'richtext'
    | 'number'
    | 'boolean'
    | 'date'
    | 'datetime'
    | 'select'
    | 'multiselect'
    | 'media'
    | 'relationship'
    | 'json'
    | 'group'
    | 'repeater'
    | 'blocks'
    | 'email'
    | 'url'
    | 'color'
    | 'slug'
    | 'range'
    | 'checkbox-group'
    | 'radio-group'
    | 'link'
    | 'key-value'
    | 'accordion'
    | 'tab';

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
    type: FieldType;
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

export type FieldGroupLocation = 'main' | 'sidebar';

export type FieldGroup = {
    name: string;
    label: string;
    location: FieldGroupLocation;
    priority?: number;
    collapsed?: boolean;
    description?: string;
    fields: FieldDefinition[];
};
