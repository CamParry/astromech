# Field Validation & System Normalization

Server-side field validation as the headline, framed as a field-system normalization. Full design + rationale: `specs/field-system-and-validation.md`.

**P0 — Contract & types (no behaviour change)** ✅

- [x] Add `FieldTypeDescriptor` type (`types/fields.ts`) + `fields/descriptors.ts` registry stub
- [x] Add `FieldValidationContext` + `FieldValidator` types (host-generic, not `Entry`-specific); `ScopedReads` + `FieldErrors`
- [x] Revise `ValidationRule`: drop `{ required: true }`; add `{ enum }`, `{ unique: true }`; widen `custom` to async `FieldValidator`
- [x] Add `error?: string[]` to `BaseFieldProps`

**P1 — Descriptor registry (source of truth)**

- [ ] Author per-core-type descriptors (build + component + tsType + default + coerce + validate + reservedKeys)
- [ ] Migrate `codegen/type-generator.ts` switch → descriptor `tsType`/`tsRelationType` lookups
- [ ] Move defaults + reserved keys (`_id`/`_disabled`/`_title`) into descriptors (single source)
- [ ] Unify plugin field-type registration onto the descriptor; add `serverValidate`

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
