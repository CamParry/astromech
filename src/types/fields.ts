/**
 * Field system types — field definitions, validation, layout containers.
 *
 * An entry's schema is a tree of `FieldDefinition` nodes. Layout containers
 * (`section`/`tabs`/`tab`/`accordion`) are field *types*, not a separate
 * hierarchy — their children keep top-level data keys (flat). Only data
 * containers (`group`/`repeater`/`blocks`) introduce a nested data key.
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
    // Layout containers — flat data, pure chrome.
    'section',
    'tabs',
    'tab',
    'accordion',
] as const;

export type FieldType = (typeof CORE_FIELD_TYPES)[number];

/**
 * A field's `type` — a core type (autocompleted) or a plugin-registered
 * custom type. The intersection keeps literal autocomplete working.
 */
export type AnyFieldType = FieldType | (string & Record<never, never>);

/**
 * Config-time i18n key descriptor. `t(key)` returns one of these; it survives
 * JSON serialization into the virtual config module and is resolved to a
 * translated string by the admin renderer (`resolveLabel`).
 */
export type MessageDescriptor = { $t: string };

/** A user-facing label — a literal string or a captured i18n key. */
export type Label = string | MessageDescriptor;

export type SelectOption = {
    value: string;
    label: Label;
};

export type BlockDefinition = {
    type: string;
    label?: Label;
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
    label?: Label;
    required?: boolean;
    defaultValue?: unknown;
    description?: Label;
    validation?: ValidationRule[];

    // Type-specific options
    options?: SelectOption[] | string[];
    target?: string;
    multiple?: boolean;
    inverse?: string;
    ordered?: boolean;
    onDelete?: 'cascade' | 'set-null' | 'restrict';
    /** Children for layout containers and `group`/`repeater`. */
    fields?: FieldDefinition[];
    min?: number;
    max?: number;
    step?: number;
    collapsed?: boolean;
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
 * Top-level entry field declaration. Either a flat list (chrome-less, single
 * column) or an explicit two-column split. The *shape* signals the layout —
 * there is no `layout()` helper.
 */
export type EntryFields =
    | FieldDefinition[]
    | { main: FieldDefinition[]; sidebar?: FieldDefinition[] };

/** Resolved two-column field layout consumed by the renderer + type-gen. */
export type ResolvedEntryFields = {
    main: FieldDefinition[];
    sidebar: FieldDefinition[];
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
