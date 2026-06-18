/**
 * Field system types — field definitions, validation, layout containers.
 *
 * An entry's schema is a tree of `FieldDefinition` nodes. Layout containers
 * (`section`/`tabs`/`tab`/`accordion`) are field *types*, not a separate
 * hierarchy — their children keep top-level data keys (flat). Only data
 * containers (`group`/`repeater`/`blocks`) introduce a nested data key.
 */

import type { User } from './domain.js';

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
    'tree',
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
    fields: FieldDefinition[];
};

/**
 * A declarative validation rule on a field.
 *
 * Rules are serializable (so they can be mirrored client-side later) — except
 * `custom`, which is an imperative server-only validator. `{ required: true }`
 * is intentionally absent: required-ness is the `FieldDefinition.required` flag,
 * declared in exactly one place. `{ unique: true }` resolves to
 * `ctx.reads.isUnique(field, value)` in the pipeline.
 */
export type ValidationRule =
    | { minLength: number }
    | { maxLength: number }
    | { min: number }
    | { max: number }
    | { pattern: string; message?: string }
    | { email: true }
    | { url: true }
    | { enum: string[] }
    | { unique: true }
    | { custom: FieldValidator };

// ============================================================================
// Validation contract (server-side field pipeline)
//
// The descriptor + pipeline implementation lives in `fields/`; these are the
// shared types. See specs/field-system-and-validation.md §4.
// ============================================================================

/** Per-field validation errors — the `422 details.fields` wire shape. */
export type FieldErrors = Record<string, string[]>;

/**
 * Scoped read access handed to a field validator for async checks (uniqueness,
 * references). Exposes the sanctioned read paths for the field's host domain
 * (built on the entry-access port for entries; per-domain reads elsewhere). The
 * common uniqueness case is the one-line `isUnique` helper. Concrete read paths
 * are added in P2 alongside the pipeline.
 */
export type ScopedReads = {
    /** True when no other record in the host scope holds `value` for `field`. */
    isUnique: (field: FieldDefinition, value: unknown) => Promise<boolean>;
};

/**
 * Context passed to a `FieldValidator`. Host-generic — works for entries, media,
 * users, and settings, not just entries. Cross-field rules read siblings off
 * `values`; the host record is available raw on `host.record`.
 */
export type FieldValidationContext = {
    /** The field's own value. */
    value: unknown;
    /** Sibling field values, for cross-field rules. */
    values: Record<string, unknown>;
    field: FieldDefinition;
    /** Nested path to the field, e.g. `['address', '0', 'postcode']`. */
    path: string[];
    operation: 'create' | 'update';
    host: { kind: 'entry' | 'media' | 'user' | 'setting'; record: unknown };
    user: User | null;
    /** Scoped read access for async checks. */
    reads: ScopedReads;
};

/**
 * A field validator. Async-only (no sync/async split): uniqueness and other
 * read-backed checks are just custom validators handed a reads handle. Returns
 * `true` when valid, or an error message string.
 */
export type FieldValidator = (ctx: FieldValidationContext) => Promise<true | string>;

/**
 * The single source of truth for a field type. Core and plugin field types
 * register the same descriptor shape; the pipeline dispatches to it. Replaces
 * the ~6 drifting surfaces (union, builder, component registry, type-gen switch,
 * defaults, coercion) with one record per type. Populated in P1.
 */
export type FieldTypeDescriptor = {
    type: string;
    /** The builder factory — `type(name, options?)` returning a `FieldDefinition`. */
    // `any` — heterogeneous factory option types; a registry can't hold a single precise signature.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    build: (name: string, options?: any) => FieldDefinition;
    /** Import specifier for the admin (browser) component. */
    component: string;
    /** TS type emitted by codegen for this field, or `null` to omit. */
    tsType: (field: FieldDefinition, shape: 'full' | 'public') => string | null;
    /** TS type for the relation-expanded form, when the field is a relation. */
    tsRelationType?: (field: FieldDefinition) => string | null;
    defaultValue?: unknown;
    /** Storage normalization applied before validation. */
    coerce?: (value: unknown) => unknown;
    /** Type-intrinsic validation rule (plugin `serverValidate` fills this slot). */
    validate?: FieldValidator;
    /** Reserved instance keys this type owns, e.g. `['_id', '_disabled', '_title']`. */
    reservedKeys?: string[];
    isLayout?: boolean;
    isContainer?: boolean;
    isRelation?: boolean;
};

/**
 * Allow-list for rich-text field features.
 * All features are enabled by default; set a key to `false` to disable.
 * Disabling a feature removes it from the ProseMirror schema (not just the toolbar).
 */
export type RichTextAllow = {
    heading?: boolean;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    code?: boolean;
    codeBlock?: boolean;
    link?: boolean;
    bulletList?: boolean;
    orderedList?: boolean;
    blockquote?: boolean;
    horizontalRule?: boolean;
    textAlign?: boolean;
};

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
    /** Children for layout containers and `group`/`repeater`/`tree`. */
    fields?: FieldDefinition[];
    min?: number;
    max?: number;
    /** Maximum nesting depth for `tree` fields. Unlimited when omitted. */
    maxDepth?: number;
    /**
     * `group` only. When `false` the group becomes invisible chrome: box AND
     * label are dropped and the sub-fields render inline, keeping only the nested
     * data key. Wrap it in a `section` when a heading/surface is wanted. Defaults
     * to `true`.
     */
    container?: boolean;
    step?: number;
    collapsed?: boolean;
    accept?: string;
    blocks?: BlockDefinition[];

    /**
     * Advisory character counter for `text`/`textarea`. `true` shows the length
     * only; a range adds under/good/over status colouring. Soft — exceeding
     * `max` is allowed and merely flagged. For a hard cap use `maxLength`.
     */
    count?: boolean | { min?: number; max?: number };
    /** Enforced maximum input length (HTML `maxlength`) on text inputs. */
    maxLength?: number;

    // Translation support
    translatable?: boolean;

    /**
     * Multi-type storage indexes this field for free-text search; collected
     * into the entry type's `search` list at resolve time.
     */
    searchable?: boolean;

    /** When true, this field is omitted from `public`-shape reads. Default: false (public). */
    private?: boolean;

    /**
     * `richtext` only. Subset of features to enable. All on by default.
     * Disabling a feature removes it from the schema (not just the toolbar).
     */
    allow?: RichTextAllow;
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
    /** Server (or local) validation errors for this field; rendered by `FieldWrapper`. */
    error?: string[];
};
