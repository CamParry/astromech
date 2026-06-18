# Field System Normalization & Validation

**Status:** **Design locked, unimplemented (2026-06-18).** Direction agreed after a five-front investigation of the field system. Headline deliverable is **server-side field validation**, but the work is framed as a **field-system normalization** — validation is the first missing stage of a field pipeline that does not yet exist.

**Supersedes (in part):** the assumption that validation is an entries-service concern. Fields are cross-domain; validation is a shared primitive.

**Related:** `roadmap/in-progress/populate-and-complex-field-data-model.md` (media populate + repeater `_id` identity) is adjacent — same `fields` JSON blob, different concern (hydration/identity vs validation). Keep separate; the descriptor's `reservedKeys` should be the single source for `_id`/`_disabled`/`_title`, which that work also touches.

**Touches:** `packages/astromech/src/fields/*` (new descriptor + pipeline), `packages/astromech/src/types/fields.ts` (`ValidationRule`, `BaseFieldProps`, new context types), `packages/astromech/src/codegen/type-generator.ts` (switch → descriptor lookups), `packages/astromech/src/entries/service.ts` + `media/service.ts` + `users/service.ts` + `settings/service.ts` (call the pipeline), `packages/astromech/src/plugins/runtime/plugin-fields.ts` + `types/plugins.ts` (`serverValidate`), `packages/astromech/src/admin/components/fields/*` (error channel + shared `FieldWrapper`), `packages/astromech/src/admin/hooks/use-entry-form.ts` (map `422 details.fields`).

---

## 1. The unifying thesis

**Field definitions drive everything except enforcement.** A `FieldDefinition[]` powers admin form rendering, TS codegen, visibility, and relationships — but on the server it never validates, never applies defaults, never coerces. Field definitions are inert declarative metadata.

Two root structural problems produce every symptom:

1. **No single source of truth per field type (vertical fragmentation).** A field type is declared across 5–6 distant surfaces — the `AnyFieldType` union, the builder factory (`fields/builder.ts`), the component registry (`admin/definitions/register-fields.ts`), the type-gen switch (`codegen/type-generator.ts`), defaults, and coercion — that drift silently. Adding one field type means editing 5–6 files with zero cross-check.
2. **No shared field-processing pipeline (horizontal fragmentation).** All four field-bearing domains — **entries, media, users, settings** — independently store a `fields`/`value` JSON blob typed `z.record(string, unknown)` and validate only their *envelope* (title/slug; alt; name/email; key). `config.media.fields` and `config.users.fields` are **dead code server-side**. Plugin custom-field `validate()` is **browser-only**.

Validation is not a feature to bolt on; it is the first missing stage of a field pipeline. Defaults-never-applied and coercion-scattered are the same gap at different stages.

## 2. Flaws found (the evidence)

**Vertical (field-type authority):**
- Validation rules declared (`ValidationRule[]`), enforced nowhere on the server.
- Defaults declared (`defaultValue`), never applied on create.
- `required` declared **twice**: `FieldDefinition.required` flag *and* a `{ required: true }` rule. Only the flag is read.
- Plugin field types are a **parallel registration system** to core types.
- Coercion/rendering scattered per-component (richtext, link hardcoded in both type-gen and component).
- Reserved instance keys (`_id`, `_disabled`, `_title`) hardcoded in the type-gen switch, no central definition.

**Horizontal (cross-domain):**
- Four domains, four independent unvalidated blobs. The *envelope* diverges (title vs alt vs name vs key); the *fields-blob handling is identical and identically broken*. That uniformity is the seam for a shared primitive.
- Plugin custom field types have no server-side validation path.

**Admin error channel:**
- No `error` prop on any of the 26 field components; only `Input`/`Textarea` primitives can render one. `disabled` handled inconsistently (~8 ignore it). `json`/`media` carry bespoke local error state. `use-entry-form.ts` **discards** the already-per-field `422 details.fields`, toasting only. Redundant label-wrapper rendering (`FormField` + `Input` both build wrappers).

**Cross-cutting bugs found en route (out of scope here, log separately):** create + `saveRelationships` are not transactional; create lacks the translatable-field propagation that update has.

## 3. Decisions (Locked)

1. **Descriptor-first.** Build a single per-field-type descriptor as the source of truth; the pipeline dispatches to it. (Building the pipeline without it just creates another scattered switch.)
2. **Designed for all four domains** (entries, media, users, settings), wired incrementally: entries → media + users → settings. The shared, host-generic context signature is decided up front regardless of rollout order.
3. **Pipeline = coerce → default → validate** (all three stages; defaults-never-applied is fixed for free).
4. **Plugin `serverValidate`** baked into the descriptor/registration from the start.
5. **Validator is async-only** — no sync/async split. Uniqueness is just a custom validator handed a reads handle.
6. **Declarative rules stay serializable** (client-mirrorable later); `custom` is server-only imperative.
7. **`required` is a flag, not a rule.** Remove the `{ required: true }` `ValidationRule` variant.
8. **Reads handle:** the validator context carries a **scoped reads handle**, with a thin **`isUnique(field, value)`** helper built on top so the common case is one line. (Chosen over a raw `db` handle for encapsulation, and over a per-domain `isUnique`-only primitive for power.)
9. **Cross-field rules live on the field** that owns the constraint (e.g. `endDate` carries `> startDate` and reads siblings off the host record). **No entry/document-level `validate` hook yet.**
10. **Reuse the existing wire format.** `validationFailed` → `422` with `details.fields: Record<string, string[]>` already handles Zod + `ValidationError`; the pipeline feeds the same shape.

**Deferred:** error/warning severity (Sanity-style); client-side declarative mirror; document-level `validate`.

## 4. The contract

### 4.1 Validator context (host-generic — NOT `Entry`-specific)

```ts
type FieldValidationContext = {
  value: unknown;                       // the field's own value
  values: Record<string, unknown>;      // sibling field values (cross-field reads)
  field: FieldDefinition;
  path: string[];                       // nested path, e.g. ['address', '0', 'postcode']
  operation: 'create' | 'update';
  host: { kind: 'entry' | 'media' | 'user' | 'setting'; record: unknown };
  user: User | null;
  reads: ScopedReads;                   // scoped read access for async checks
};

type FieldValidator = (ctx: FieldValidationContext) => Promise<true | string>;
```

`reads` exposes the sanctioned read paths (built on the entry-access port for entries; per-domain reads for the others). `isUnique(field, value)` is a helper over `reads`.

### 4.2 `ValidationRule` (revised)

```ts
type ValidationRule =
  | { minLength: number }
  | { maxLength: number }
  | { min: number }
  | { max: number }
  | { pattern: string; message?: string }
  | { email: true }
  | { url: true }
  | { enum: string[] }
  | { unique: true }                    // declarative; resolves to isUnique via reads
  | { custom: FieldValidator };         // server-only, async
// NOTE: { required: true } REMOVED — required is FieldDefinition.required (a flag).
```

### 4.3 Field-type descriptor (source of truth)

```ts
type FieldTypeDescriptor = {
  type: string;
  build: (name: string, options?: unknown) => FieldDefinition;   // the builder factory
  component: string;                                             // import specifier (browser)
  tsType: (field: FieldDefinition, shape: 'full' | 'public') => string | null;
  tsRelationType?: (field: FieldDefinition) => string | null;
  defaultValue?: unknown;
  coerce?: (value: unknown) => unknown;                          // storage normalization
  validate?: FieldValidator;                                     // type-intrinsic rule
  reservedKeys?: string[];                                       // e.g. ['_id','_disabled','_title']
  isLayout?: boolean; isContainer?: boolean; isRelation?: boolean;
};
```

Core and plugin types register the same descriptor shape; plugin descriptors supply `serverValidate` (the `validate` slot) so custom types enforce server-side.

### 4.4 The pipeline

```ts
function processFields(
  values: Record<string, unknown>,
  definitions: FieldDefinition[],
  ctx: Omit<FieldValidationContext, 'value' | 'values' | 'field' | 'path'>,
): Promise<{ values: Record<string, unknown>; errors: FieldErrors }>;
// errors: Record<string, string[]>  (same shape as details.fields)
```

Per field, in order: **coerce** (descriptor.coerce) → **default** (apply descriptor.defaultValue / field.defaultValue when value is absent, create only) → **validate** (`required` flag, then declarative rules, then descriptor.validate, then field `custom` rules — all async, run per-field, collected). Errors abort the mutation via `ValidationError` → existing `422 details.fields`.

### 4.5 Admin error surfacing

- Add `error?: string[]` to `BaseFieldProps`.
- One shared `FieldWrapper` owns label + description + error + `aria-invalid`/`aria-describedby`; `FormField` wraps controls in it (removes the redundant double wrapper).
- `use-entry-form.ts` extracts `details.fields` from a `422` and threads it down (do not toast field errors away).
- Normalize all 26 components onto the wrapper; fix the `disabled` inconsistencies; fold `json`/`media` local errors into the same channel (server errors take precedence over local parse errors).

## 5. Sequenced plan

See `roadmap/planned/field-validation-and-normalization.md` for the checklist. Phase summary:

- **P0 — Contract & types** (no behaviour change): descriptor type, context types, revised `ValidationRule` (drop `{required:true}`), `error?` on `BaseFieldProps`.
- **P1 — Descriptor registry**: per-core-type descriptors; migrate the type-gen switch, defaults, and reserved keys to descriptor lookups; unify plugin registration onto the descriptor (`serverValidate`).
- **P2 — Pipeline**: `processFields` (coerce → default → validate); declarative rule runner; `reads` + `isUnique`.
- **P3 — Wire entries**: call the pipeline in `entries/service.ts` (after envelope validation, before slug/hooks); retrofit the five stub fields (`email`, `url`, `slug`, `json`, `key-value`); slug uniqueness via `isUnique`.
- **P4 — Wire media/users/settings**: each mutation runs the pipeline against its config field definitions (currently dead code).
- **P5 — Admin error surfacing**: `FieldWrapper`, error threading, `422` mapping, component normalization.
- **Deferred**: severity, client mirror, document-level validate. Separately: the two cross-cutting mutation bugs (transaction boundary, create translatable propagation).
