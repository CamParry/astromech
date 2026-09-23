/**
 * Field system types — field definitions, validation, field categories. An
 * entry's schema is a tree of `Field` nodes: a `DataField` stores under its
 * name, a `LayoutField` has none. `TERMINOLOGY.md` states the categories.
 */

import type { ResourceType, User } from './domain';

/** Every built-in field type, including layout fields. */
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
    // Structural only: with no name they are layout fields and store nothing.
    'tabs',
    'tab',
    'accordion',
] as const;

export type FieldTypeName = (typeof CORE_FIELD_TYPES)[number];

/**
 * A field's `type` — a core type (autocompleted) or a plugin-registered
 * custom type. The intersection keeps literal autocomplete working.
 */
export type AnyFieldType = FieldTypeName | (string & Record<never, never>);

/**
 * Config-time reference to a message in the i18n catalogue. `t(key)` returns one
 * of these; it survives JSON serialization into the virtual config module and is
 * resolved to a translated string by the admin renderer (`resolveLabel`).
 */
export type MessageRef = { $t: string };

/** A user-facing label — a literal string or a captured i18n key. */
export type Label = string | MessageRef;

export type SelectOption = {
    value: string;
    label: Label;
};

export type Block = {
    type: string;
    label?: Label;
    fields: Field[];
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
 * is intentionally absent: required-ness is the `Field.required` flag,
 * declared in exactly one place. `{ unique: true }` resolves to
 * `ctx.isUnique(field, value)` in the pipeline.
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

/**
 * One step of a field path: a declared field, or one item of a container.
 *
 * The *contract* lives here with the other field types (pure leaf layer) so that
 * `FieldType` and `FieldValidationContext` can reference it; the formatters
 * and parser that render and read it live in `fields/field-path.ts`,
 * which re-exports this type. Items are addressed by their persisted `_id`,
 * never by array index — see that module's header for the full grammar.
 */
export type FieldPathSegment =
    | { kind: 'field'; name: string }
    | { kind: 'item'; id: string };

// Validation contract (server-side field pipeline) — implementation lives in fields/

/** Per-field validation errors — the `422 details.fields` wire shape. */
export type FieldErrors = Record<string, string[]>;

/**
 * Which half of validation applies to a write. `'complete'` runs everything,
 * `required` and container `min` included; `'partial'` skips only those
 * completeness checks, so a draft can be saved half-finished while what IS
 * filled in still gets its correctness checks.
 */
export type ValidationMode = 'partial' | 'complete';

/**
 * Context passed to a `FieldValidator`. Resource-generic — works for entries, media
 * and users, not just entries. Cross-field rules read siblings off
 * `values`; the current record is available raw on `resource.record`.
 */
export type FieldValidationContext = {
    /** The field's own value. */
    value: unknown;
    /** Sibling field values, for cross-field rules. */
    values: Record<string, unknown>;
    field: DataField;
    /**
     * Path to the field, as segments — one `field` segment per declared field
     * plus an `item` segment per container item traversed, e.g.
     * `[{kind:'field',name:'sections'},{kind:'item',id:'a1'},{kind:'field',name:'title'}]`.
     * Render it with `formatInstancePath` (`fields/field-path.ts`) to get the key
     * the pipeline files this field's errors under.
     */
    path: FieldPathSegment[];
    operation: 'create' | 'update';
    /**
     * Whether this write runs completeness checks. Always concrete here — a
     * `custom` validator never has to guess — even though the pipeline's callers
     * may leave it out and take the `'complete'` default.
     */
    validation: ValidationMode;
    resource: { kind: ResourceType; record: unknown };
    user: User | null;
    /** True when no other record of the same resource holds `value` for `field`. */
    isUnique: (field: DataField, value: unknown) => Promise<boolean>;
    /**
     * The entry type each id resolves to, for the relationship target-type
     * check. Ids with no entry row are simply absent. Optional: a caller with no
     * entry access (the admin, a plugin's own reads) omits it and the check is
     * skipped rather than guessed.
     */
    entryTypes?: (ids: string[]) => Promise<Map<string, string>>;
};

/**
 * A field validator. Async-only (no sync/async split): uniqueness and other
 * read-backed checks are just custom validators handed a reads handle. Returns
 * `true` when valid, or an error message string.
 */
export type FieldValidator = (ctx: FieldValidationContext) => Promise<true | string>;

/**
 * What a resource validator reports. A string is a form-level message (it
 * belongs to no single field); an object maps field paths to messages, using
 * the same `_id` path grammar the field pipeline files errors under. A valid
 * resource returns `undefined` or `null` — explicitly, since `void` is not in
 * the union, so a validator cannot just fall off the end of its body.
 */
export type ResourceValidationResult = string | Record<string, string> | null | undefined;

/**
 * Context handed to a resource validator. The same shape as
 * `FieldValidationContext` minus the per-field members, plus the definitions
 * the values were validated against.
 *
 * `values` are the COERCED values the field pipeline produced, and they may
 * still hold field errors — a resource validator runs regardless, so the author
 * sees cross-field and per-field problems in one pass. Guard accordingly.
 */
export type ResourceValidationContext = {
    values: Record<string, unknown>;
    definitions: Field[];
    operation: 'create' | 'update';
    validation: ValidationMode;
    resource: { kind: ResourceType; record: unknown };
    user: User | null;
    /** True when no other record of the same resource holds `value` for `field`. */
    isUnique: (field: DataField, value: unknown) => Promise<boolean>;
    /**
     * The entry type each id resolves to, for the relationship target-type
     * check. Ids with no entry row are simply absent. Optional: a caller with no
     * entry access (the admin, a plugin's own reads) omits it and the check is
     * skipped rather than guessed.
     */
    entryTypes?: (ids: string[]) => Promise<Map<string, string>>;
};

/**
 * A whole-resource validator — cross-field rules no single field owns, for an
 * entry, a global, a media item or a user. Async only, matching
 * `FieldValidator`. Server-side only: it is a function, so it cannot survive
 * the JSON round trip into the admin config.
 */
export type ResourceValidator = (
    ctx: ResourceValidationContext
) => Promise<ResourceValidationResult>;

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
    definitions: Field[];
    /**
     * LIVE reference to this scope's value object inside the normalized
     * container value returned as `next`. The pipeline mutates it in place.
     */
    values: Record<string, unknown>;
};

/** One nested scope a container field declares: its fields, and whether it repeats per item. */
export type SubFields = {
    fields: Field[];
    /** True when the scope is one item of an array value (`repeater`, `blocks`, `tree`). */
    repeats: boolean;
};

/**
 * What codegen hands a field type's `tsType`, so a container can type its
 * nested scopes without knowing where it sits in the generated file.
 */
export type TsTypeEmit = {
    /** The `name?: type;` property lines of a nested scope, in the current shape. */
    properties: (fields: Field[]) => string[];
    /**
     * Declare a named type beside the entry type's own and return its name, which
     * codegen prefixes with the entry type's. `body` receives that name, for recursion.
     */
    alias: (name: string, body: (name: string) => string) => string;
};

/**
 * The behaviour behind one field type name, core or plugin. The pipeline,
 * codegen, visibility, references and config validation all dispatch to it
 * rather than branching on type names.
 */
export type FieldType = {
    type: string;
    /** The builder factory — `type(name, options?)` returning a `Field`. Core types only. */
    // `any` — heterogeneous factory option types; a registry can't hold a single precise signature.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    build?: (name: string, options?: any) => Field;
    /**
     * TS type emitted by codegen, or `null` to omit the field. Absent means
     * `JsonValue`. A container types its nested scopes through `emit`.
     */
    tsType?: (
        field: DataField,
        shape: 'full' | 'public',
        emit: TsTypeEmit
    ) => string | null;
    defaultValue?: unknown;
    /** Normalisation applied before validation. */
    coerce?: (value: unknown) => unknown;
    /**
     * Type-intrinsic validation, run before any author rule. Every core data
     * type declares one: the declarative rules report a mismatch rather than
     * judging a value of the wrong type.
     */
    validate?: FieldValidator;
    /**
     * Container types only: expose the nested scopes inside this field's value
     * so a walk over values recurses without switching on type. Returns the
     * normalized container value (`next` — cloned, with item `_id`s minted)
     * plus a flat list of scopes holding live references into it.
     */
    children?: (
        field: DataField,
        value: unknown
    ) => { next: unknown; scopes: ContainerScope[] };
    /** Container types only: the nested scopes the field declares, for a walk over the schema. */
    subFields?: (field: DataField) => SubFields[];
    /** The value a `public`-shape read returns, e.g. rich text rendered to HTML. */
    toPublic?: (field: DataField, value: unknown) => unknown;
    /** `false` for a type that stores nothing, such as a preview. Default `true`. */
    affectsData?: boolean;
    /** Whether the type may be declared without a name, as a layout field. */
    layout?: boolean;
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

/**
 * A field that stores a value under its `name`. A named `group`, `repeater`,
 * `blocks` or `tree` is a nested field: its children store under that key.
 */
export type DataField = {
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
    /** Children for `group`/`repeater`/`tree`. */
    fields?: Field[];
    min?: number;
    max?: number;
    /** Maximum nesting depth for `tree` fields. Unlimited when omitted. */
    maxDepth?: number;
    /**
     * `group` only. Whether the group draws a box. When `false` the box AND the
     * label are dropped and the sub-fields render inline, keeping only the
     * nested data key. Defaults to `true`.
     */
    boxed?: boolean;
    step?: number;
    collapsed?: boolean;
    accept?: string;
    blocks?: Block[];

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
     * The multi-type repository indexes this field for free-text search; collected
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
 * A structural field with no name: it draws a surface and stores nothing, so
 * its children store in the parent's data. `private` applies to every child.
 */
export type LayoutField = {
    name?: undefined;
    type: 'group' | 'accordion' | 'tabs' | 'tab';
    label?: Label;
    description?: Label;
    /** `group` only. An unnamed group must draw its box, so only `true` is accepted. */
    boxed?: boolean;
    /** `accordion` only. Starts closed when `true`. */
    collapsed?: boolean;
    private?: boolean;
    fields: Field[];
};

/** A field declaration — one node in an entry's schema tree. A name is always a data key. */
export type Field = DataField | LayoutField;

/**
 * Top-level entry field declaration. Either a flat list (no layout fields,
 * single column) or an explicit two-column split. The *shape* signals the layout —
 * there is no `layout()` helper.
 */
export type EntryFields = Field[] | { main: Field[]; sidebar?: Field[] };

/** Resolved two-column field layout consumed by the renderer + type-gen. */
export type ResolvedEntryFields = {
    main: Field[];
    sidebar: Field[];
};

/**
 * Base props for all field components
 */
export type BaseFieldProps = {
    name: string;
    value: unknown;
    field: DataField;
    required?: boolean;
    onChange: (name: string, value: unknown) => void;
    disabled?: boolean;
    /** Server (or local) validation errors for this field; rendered by `FieldWrapper`. */
    error?: string[];
};
