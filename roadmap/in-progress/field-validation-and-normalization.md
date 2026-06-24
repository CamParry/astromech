# Field Validation & System Normalization

Server-side field validation as the headline, framed as a field-system normalization. Full design + rationale: `specs/field-system-and-validation.md`.

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

**P6 — Remaining design work** (full design state: `specs/field-validation-next-phase.md`)

- [ ] **Nested / container validation** (foundational; coupled to `populate-and-complex-field-data-model`). DECISION LOCKED: nested-error addressing is `_id`-based (`blocks._abc123.heading`), not index-based — reorder-stable, shared with the populate feature's path scheme. Pipeline recursion + exact path grammar still to design
- [ ] Error/warning severity (Sanity-style) — design open
- [ ] Document-level `validate` hook — design open
- [ ] Client-side declarative-rule mirror (declarative rules only; async/custom/unique stay server-side)
- [ ] JSON-indexed uniqueness (optimise the in-memory `isUnique` scan) — lowest priority

**Entry-create bugs** (folded into this branch by user request)

- [~] **Atomic create + relationships** — DONE but UNCOMMITTED in the worktree. `entries.create` now wraps entry-create + `saveRelationships` in `storage.transaction` (was two separate ops → orphaned entry on relationship failure). Changes: `entries/service.ts`, new `tests/services/entries/create-atomicity.test.ts`, `tests/_support/harness.ts` (test DB `:memory:`→temp file; libsql nulls the in-memory handle after a transaction). Re-run the gate before committing
- [ ] **Translatable propagation on create** — DECISION OPEN. Non-translatable (group-shared) fields aren't synced when creating a translation that joins an existing group. Options: (1) inherit from siblings [recommended, non-destructive], (2) push like update [wipes on the blank-in-group flow], (3) smart merge. See spec §7.2
