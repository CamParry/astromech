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

**P2 — Pipeline**

- [ ] `processFields(values, definitions, ctx)` running coerce → default → validate
- [ ] Declarative rule runner (required flag, min/max, length, pattern, email, url, enum)
- [ ] `ScopedReads` handle + `isUnique(field, value)` helper

**P3 — Wire entries**

- [ ] Call `processFields` in `entries/service.ts` after envelope validation, before slug/hooks
- [ ] Throw `ValidationError(fieldErrors)` → existing `422 details.fields`
- [ ] Retrofit the five stub fields as first consumers: `email`, `url`, `slug`, `json`, `key-value`
- [ ] Slug uniqueness via `isUnique` (reconcile with the ad-hoc `storage.uniqueSlug`)

**P4 — Wire media / users / settings**

- [ ] `media/service.ts` validates against `config.media.fields` (currently dead code)
- [ ] `users/service.ts` validates against `config.users.fields` (currently dead code)
- [ ] `settings/service.ts` validates against the admin page's `fields`

**P5 — Admin error surfacing**

- [ ] Shared `FieldWrapper` (label + description + error + aria); remove the double wrapper in `FormField`
- [ ] Thread `error` through `FormField` to all field components
- [ ] `use-entry-form.ts`: map `422 details.fields` onto fields (stop toasting them away)
- [ ] Normalize the 26 components onto the wrapper; fix `disabled` inconsistencies
- [ ] Fold `json`/`media` local error state into the channel (server errors take precedence)

**Deferred**

- [ ] Error/warning severity (Sanity-style)
- [ ] Client-side declarative-rule mirror
- [ ] Document-level `validate` hook
- [ ] (Separate bugs) create+relationships transaction boundary; create translatable-field propagation
