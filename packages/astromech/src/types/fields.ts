/**
 * Field system types — field definitions, validation, field categories.
 *
 * An entry's schema is a tree of `FieldDefinition` nodes. Layout fields are
 * field *types* rather than a separate hierarchy; `TERMINOLOGY.md` states the
 * two categories and their membership.
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
    // Layout fields — presentational, flat data.
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
 * Whether a failing rule blocks the write. `'error'` (the default) rejects it;
 * `'warning'` is advisory — the editor shows it and the write proceeds. Applies
 * to `field.validation` rules only: `required`, container `min`/`max` and a
 * field type's own `validate` are always errors, because completeness and type
 * validity are never advisory.
 */
export type ValidationSeverity = 'error' | 'warning';

/**
 * A declarative validation rule on a field.
 *
 * Rules are serializable (so they can be mirrored client-side later) — except
 * `custom`, which is an imperative server-only validator. `{ required: true }`
 * is intentionally absent: required-ness is the `FieldDefinition.required` flag,
 * declared in exactly one place. `{ unique: true }` resolves to
 * `ctx.reads.isUnique(field, value)` in the pipeline.
 */
export type ValidationRule = (
    | { minLength: number }
    | { maxLength: number }
    | { min: number }
    | { max: number }
    | { pattern: string; message?: string }
    | { email: true }
    | { url: true }
    | { enum: string[] }
    | { unique: true }
    | { custom: FieldValidator }
) & { severity?: ValidationSeverity };

// ============================================================================
// Field paths
// ============================================================================

/**
 * One step of a field path: a declared field, or one item of a container.
 *
 * The *contract* lives here with the other field types (pure leaf layer) so that
 * `FieldTypeDescriptor` and `FieldValidationContext` can reference it; the
 * formatters and parser that render and read it live in `fields/field-path.ts`,
 * which re-exports this type. Items are addressed by their persisted `_id`,
 * never by array index — see that module's header for the full grammar.
 */
export type FieldPathSegment =
    | { kind: 'field'; name: string }
    | { kind: 'item'; id: string };

// ============================================================================
// Validation contract (server-side field pipeline)
//
// The descriptor + pipeline implementation lives in `fields/`; these are the
// shared types. See specs/field-system-and-validation.md §4.
// ============================================================================

/** Per-field validation errors — the `422 details.fields` wire shape. */
export type FieldErrors = Record<string, string[]>;

/**
 * Which half of validation applies to a write. `'publish'` runs everything;
 * `'save'` skips the completeness checks (`required`, container `min`) so a
 * draft can be saved half-finished without losing correctness checks on what
 * IS filled in.
 */
export type ValidationStage = 'save' | 'publish';

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
    /**
     * Path to the field, as segments — one `field` segment per declared field
     * plus an `item` segment per container item traversed, e.g.
     * `[{kind:'field',name:'sections'},{kind:'item',id:'a1'},{kind:'field',name:'title'}]`.
     * Render it with `formatFieldPath` (`fields/field-path.ts`) to get the key
     * the pipeline files this field's errors under.
     */
    path: FieldPathSegment[];
    operation: 'create' | 'update';
    /**
     * Whether this write runs completeness checks. Always concrete here — a
     * `custom` validator never has to guess — even though the pipeline's callers
     * may leave it out and take the `'publish'` default.
     */
    stage: ValidationStage;
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
 * What a document validator reports. A string is a form-level message (it
 * belongs to no single field); an object maps field paths to messages, using
 * the same `_id` path grammar the field pipeline files errors under. A valid
 * document returns `undefined` or `null` — explicitly, since `void` is not in
 * the union, so a validator cannot just fall off the end of its body.
 */
export type DocumentValidationResult = string | Record<string, string> | null | undefined;

/**
 * Context handed to a document validator. The same shape as
 * `FieldValidationContext` minus the per-field members, plus the definitions
 * the values were validated against.
 *
 * `values` are the COERCED values the field pipeline produced, and they may
 * still hold field errors — a document validator runs regardless, so the author
 * sees cross-field and per-field problems in one pass. Guard accordingly.
 */
export type DocumentValidationContext = {
    values: Record<string, unknown>;
    definitions: FieldDefinition[];
    operation: 'create' | 'update';
    stage: ValidationStage;
    host: { kind: 'entry' | 'media' | 'user' | 'setting'; record: unknown };
    user: User | null;
    reads: ScopedReads;
};

/**
 * A whole-document validator — cross-field rules no single field owns. Async
 * only, matching `FieldValidator`. Server-side only: it is a function, so it
 * cannot survive the JSON round trip into the admin config.
 */
export type DocumentValidator = (
    ctx: DocumentValidationContext
) => Promise<DocumentValidationResult>;

/** One nested value scope inside a container field's value. */
export type ContainerScope = {
    /**
     * Path segments from the container field down to this scope, e.g.
     * `[{kind:'field',name:'blocks'},{kind:'item',id:'6f1e'}]`. Relative to the
     * container field itself — the pipeline prepends the container's own parent
     * segments, so a scope is describable without knowing where it is nested.
     */
    segments: FieldPathSegment[];
    /** The field definitions that apply to this scope's values. */
    definitions: FieldDefinition[];
    /**
     * LIVE reference to this scope's value object inside the normalized
     * container value returned as `next`. The pipeline mutates it in place.
     */
    values: Record<string, unknown>;
};

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
    defaultValue?: unknown;
    /** Storage normalization applied before validation. */
    coerce?: (value: unknown) => unknown;
    /**
     * Type-intrinsic validation, run before any author rule. Required: the
     * declarative rules all report a mismatch rather than judging a value of
     * the wrong type, so a type without this has nothing checking its shape.
     */
    validate: FieldValidator;
    /**
     * Container types only: expose the nested scopes inside this field's value
     * so the pipeline can recurse generically instead of switching on type.
     * Returns the normalized container value (`next` — cloned, with item `_id`s
     * minted) plus a flat list of scopes holding live references into it.
     */
    children?: (
        field: FieldDefinition,
        value: unknown
    ) => { next: unknown; scopes: ContainerScope[] };
    /** Reserved instance keys this type owns, e.g. `['_id', '_disabled', '_title']`. */
    reservedKeys?: string[];
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
    /** Children for layout fields and `group`/`repeater`/`tree`. */
    fields?: FieldDefinition[];
    min?: number;
    max?: number;
    /** Maximum nesting depth for `tree` fields. Unlimited when omitted. */
    maxDepth?: number;
    /**
     * `group` only. When `false` the group draws nothing itself: box AND label
     * are dropped and the sub-fields render inline, keeping only the nested
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
 * Top-level entry field declaration. Either a flat list (no layout fields,
 * single column) or an explicit two-column split. The *shape* signals the layout —
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
