# Field Validation & System Normalization

Server-side field validation as the headline, framed as a field-system
normalization. The P0–P5 design spec was retired once that work shipped; the
remaining design state lives in `specs/field-validation-next-phase.md`.

**P0 — Contract & types (no behaviour change)** ✅

- [x] Add `FieldTypeDescriptor` type (`types/fields.ts`) + `fields/descriptors.ts` registry stub
- [x] Add `FieldValidationContext` + `FieldValidator` types (host-generic, not `Entry`-specific); `ScopedReads` + `FieldErrors`
- [x] Revise `ValidationRule`: drop `{ required: true }`; add `{ enum }`, `{ unique: true }`; widen `custom` to async `FieldValidator`
- [x] Add `error?: string[]` to `BaseFieldProps`

**P1 — Descriptor registry (source of truth)** ✅

- [x] Author per-core-type descriptors (build + component + tsType + default + reservedKeys + flags). `coerce`/`validate` slots intentionally left unpopulated until the pipeline consumes them (P2/P3)
- [x] Migrate `codegen/type-generator.ts` switch → descriptor `tsType` + `reservedKeys` lookups. Container recursion + `tsRelationType` stay generator-owned (the locked `tsType(field, shape)` signature can't carry cross-collection/recursion context); proven byte-identical by a frozen golden snapshot
- [x] Move defaults + reserved keys (`_id`/`_disabled`/`_title`/`_type`) into descriptors (single source for codegen). Runtime consumers (`entries/visibility.ts`, `admin/hooks/use-blocks-field.ts`) still hardcode them — deferred consolidation
- [x] Add `serverValidate` to plugin field-type registration (dormant until pipeline dispatch in P2/P3). Plugin types stay per-config, not folded into the global core-descriptor singleton

**P2 — Pipeline** ✅

- [x] `processFields(values, definitions, ctx)` running coerce → default → validate (top-level fields; data containers opaque — deep recursion deferred to coordinate with the `_id`-identity work)
- [x] Declarative rule runner (required flag, min/max, length, pattern, email, url, enum, unique, async custom) — 47 tests, test-first
- [x] `ScopedReads`/`isUnique` consumed by the pipeline via `ctx.reads`; the concrete DB-backed handle is built per-domain in P3 (entries) / P4

**P3 — Wire entries** ✅

- [x] Call `processFields` in `entries/service.ts` — create: after envelope validation, before slug/hooks; update: after loading the current entry, before the version snapshot (an invalid update must not create a spurious version)
- [x] Throw `ValidationError.fromFieldErrors(fieldErrors)` → existing `422 details.fields` (added an optional pre-shaped `fields` to `ValidationError`; middleware prefers it)
- [x] Retrofit the five stub fields as first consumers: `email`, `url`, `slug`, `json`, `key-value` (type-intrinsic coerce/validate in `fields/built-in-rules.ts`)
- [x] `isUnique` handle (`entries/reads.ts`) for `{ unique: true }` fields — in-memory scan over the JSON column. Envelope `slug` keeps its ad-hoc auto-suffix `storage.uniqueSlug` (different semantics: mutate-to-unique vs reject); `isUnique` is the separate field-level primitive. JSON-indexed uniqueness is a later optimisation

**P4 — Wire media / users / settings** ✅

- [x] `media/service.ts` validates `media.update` against `config.media.fields` (create is upload-only, no fields)
- [x] `users/service.ts` validates `create`+`update` against `config.users.fields` (create previously dropped the fields blob — now persisted)
- [x] `settings/service.ts` validates `set(key, value)` against the admin page's `fields` (resolved by `baseKey`; present-only to respect the global/per-locale key split)
- [x] Shared `fields/scoped-reads.ts` (`scopedReadsFromRecords`); entries/media/users/settings reads built on it

**P5 — Admin error surfacing**

- [x] Shared `FieldWrapper` (label + description + error + aria); `FormField` uses it. No double wrapper to remove — Input/Textarea build their own chrome only when `label`/`error`/`hint` are passed (standalone pages), which the FormField path never does
- [x] Thread `error` through `FormField` to all field components (P5a)
- [x] `use-entry-form.ts`: map `422 details.fields` onto fields (stop toasting them away) (P5a)
- [x] Normalize the components on `disabled`; `aria-invalid`/`aria-describedby` self-applied by primitives via `FieldControlContext` (FieldWrapper provides a stable error id) — no per-component aria edits (P5b)
- [x] Fold `json`/`media`/`plugin` local error state into the `.am-field-error` channel (server errors take precedence) (P5b)

**Post-merge housekeeping** ✅

- [x] Consolidate runtime reserved-key usage — `fields/reserved-keys.ts` is the single source (`RESERVED_KEY`/`RESERVED_KEY_META`/`PUBLIC_STRIPPED_KEYS`); codegen + `entries/visibility.ts` derive public-read visibility from it (can't drift). Typed instance shapes (`use-blocks-field`/`use-tree-field`, generated `.d.ts`) keep literal property names by design

**Bugs found by the nested-validation work** (all fixed on the same branch)

- [x] `FormField` looked its error up by the bare `field.name`, so **no** nested error could ever render regardless of what the server sent — the full path was already in hand as `commonProps.name`
- [x] `repeater` and `blocks` built child paths from the array index, which shifts if an item moves between form load and save
- [x] `repeater` and `group` used the child's _reported_ name as a bare object key, but leaf components report the FULL path — so editing a sub-field wrote a junk key (`socials[<id>].url`) and silently never updated the field. Pre-existing on `main` with zero test coverage; `blocks`/`tree` were already correct
- [x] The forms plugin takes `FieldDefinition.name` verbatim from form-builder JSON, so a field named `user.email` turned a 422 into a 500. Fixed at both ends — `pattern` on the builder's `name` (only _enforceable_ now, since that field lives in a blocks container) and `compile.ts` skipping names the grammar can't express

**P6 — Remaining design work** (full design state: `specs/field-validation-next-phase.md`)

- [x] **Nested / container validation** — `fields/field-path.ts` is the one addressing grammar (`blocks[<id>].heading`; item selectors are `_id`-based, brackets not dots, `_children` never a segment because tree ids are unique tree-wide, so paths chain through declared fields only). Recursion is descriptor-driven — a `children(field, value)` slot returns the normalized container value plus `ContainerScope[]` holding live references into it, so a plugin container type nests for free and the pipeline never reassembles. It was NOT blocked on `relationships-model.md`: `_id` was already persisted client-side and the only genuine coupling was the grammar, which `formatSchemaPath` now exposes for the relationships index. Container `_id`s are minted server-side (API/CLI writes stored items with no identity while codegen has always emitted `_id: string` non-optional) — a real stored-shape change. Also enforces repeater/blocks/tree `min`/`max` as item counts, and errors on an undeclared block `_type`
- [ ] Error/warning severity (Sanity-style) — design open
- [ ] Document-level `validate` hook — design open
- [x] **Client-side field validation** — the admin runs the SAME `fields/pipeline.ts` the server does, handed a `ScopedReads` stub; it is not a mirror, so there is nothing to keep in sync. The old wording here ("declarative rules only") was wrong: what the browser skips is decided by DATA-DEPENDENCE, not declarative-vs-imperative. `unique` needs a read; `custom` is a function, which `JSON.stringify` flattens to `{}` on its way into the admin config (it does not drop the rule) — both skipped in silence. The type-intrinsic descriptor validators (`url`, `email`, `json`, `key-value`) are pure core code already in the bundle and DO run, which is the case the old wording would have missed. Completeness (`required`, container `min`) split from correctness (everything else, including container `max`) behind a pipeline `stage: 'save' \| 'publish'` defaulting to `'publish'`, so media/users/settings are unaffected; entries derive it from the status the row will hold, and a `statuses: false` type always validates as a publish (its status is always `'unpublished'`, so deriving from status alone would have silently disabled `required` there). One message per field, short-circuiting `required` → container counts → type-intrinsic → author rules — the type's own validator now precedes the author's, since an author rule is unevaluable against a value of the wrong type. Timing: blur only once the field is dirty (so tabbing through a form to survey it turns nothing red), keystroke re-validation once a field is showing an error, everything on submit. TanStack Form's per-field machinery was unusable — the whole field tree sits under one `form.Field name="fields"` — so `form-field.tsx` is the single choke point where a field's full `_id` path is known. Per-field `role="alert"` dropped for the persistent `aria-invalid`/`aria-describedby` association (it was also mounted with its text already present, which several AT/browser combinations never announce); the sweep found six field types with no association at all (`checkbox-group`, `radio-group`, `range`, `richtext`, `link`'s target select, `json`), fixed in the shared `ui/` primitives. Base UI's `Slider.Thumb` forwards only `aria-describedby` to the input that takes focus, so `range` carries the description but not `aria-invalid`. The toast names the failing fields (up to three, then a count, resolving `_id` paths back to declared labels) and doubles as the submit-time summary — Base UI's toast viewport is already a persistent polite live region
- [ ] JSON-indexed uniqueness (optimise the in-memory `isUnique` scan) — lowest priority
- [ ] `mergeStaged` writes via `txStorage.update` and so bypasses `processFields` entirely — incomplete staged content can land on a live canonical with no validation. Pre-existing, surfaced while threading the save/publish stage; editing a staged entry is fine (it routes through `updateOne` at status `'unpublished'`, i.e. stage `'save'`, which is what a staged entry wants)
- [ ] `handlePublish` bypasses `form.handleSubmit`, so publishing never runs TanStack's title validator — an entry can be published with an empty title from that path. Pre-existing; the field-validation gate was added to `handlePublish` but deliberately did not widen scope to fix this

**Entry-create bugs** (folded into this branch by user request)

- [x] **Atomic create + relationships** — `entries.create` (`entries/operations/create.ts`) wraps entry-create + `saveRelationships` in `storage.transaction` (was two separate ops → orphaned entry on relationship failure). Changes: `entries/operations/create.ts`, `tests/services/entries/create-atomicity.test.ts`, `tests/_support/harness.ts` (test DB `:memory:`→temp file; libsql nulls the in-memory handle after a transaction)
- [ ] **Translatable propagation on create** — DECISION OPEN. Non-translatable (group-shared) fields aren't synced when creating a translation that joins an existing group. Options: (1) inherit from siblings [recommended, non-destructive], (2) push like update [wipes on the blank-in-group flow], (3) smart merge. See spec §7.2
