# Validation naming and navigability

The field validation pipeline behaves correctly. Reading it does not work.

Four unrelated things are called `validate`, and following a write from
`createEntry` down to the rule that rejected a value crosses all four:

| Symbol                   | Where                                                 | What it is                                       |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------ |
| `validate(schema, data)` | `packages/astromech/src/entries/internal/validate.ts` | a zod parse that rethrows `ZodError` as a 422    |
| `entryType.validate`     | `packages/astromech/src/types/config.ts`              | the author's whole-resource cross-field function |
| `resourceValidate`       | `packages/astromech/src/fields/parse-fields.ts`       | the same thing, renamed on the way in            |
| `FieldType.validate`     | `packages/astromech/src/types/fields.ts`              | a field type's own intrinsic check               |

`packages/astromech/src/entries/operations/create.ts` imports the first and
reads the second into the third, ten lines apart.

Two further costs:

- **Nine call sites hand-assemble the same eight-key pipeline context**, each
  ending in `...(resourceValidate ? { resourceValidate } : {})`. Entries
  create, update and merge; users create and update; media update; the settings
  service; the CLI content check; the admin's client-side runner.
- **No symbol means "validate an entry".** The work sits in two private,
  same-named, different-signatured `toStoredFields` functions plus a third
  inline copy in `staging/merge.ts`.

## What stays

The draft-versus-publish split stays. Payload bypasses required-field
validation for a draft write and Strapi enforces required only on publish, so
an editor who cannot save half-finished work is fighting the norm, not just
this CMS. Astromech's version is finer than Payload's: it separates
completeness (`required`, container `min`) from correctness (types, `max`,
author rules), so a draft still cannot store a malformed URL.

`parseFields` keeps its verb. In zod, `parse` means strip undeclared keys,
coerce, apply defaults, check, and throw, which is what this function does to a
field tree, including `projectToSchema` dropping unknown keys. `validateFields`
would hide that it rewrites what gets stored, and `prepareFields` would hide
that it can fail.

It keeps its verb without gaining a noun. The parse is identical for entries,
users, media, settings and form submissions, so `parseEntryFields` would
advertise a difference that does not exist.

## The work

- [x] **`parseInput` replaces the three copied zod wrappers.** One
      implementation in `packages/astromech/src/errors/validation.ts`, beside
      `ValidationError` and behind the `errors/` barrel: that file already
      imports zod, and translating one error type into another is the subject.
      Update the seven call sites, delete
      `packages/astromech/src/entries/internal/validate.ts`,
      `packages/astromech/src/users/internal/validate.ts` and
      `packages/astromech/src/media/internal/validate.ts`. Absorbs
      `roadmap/completed/three-identical-validate-helpers.md`, which had left the
      home open.
- [x] **Split the pipeline's throwing and non-throwing shapes**, following
      zod's own convention. `parseFields` throws the 422; `safeParseFields`
      returns `{ values, errors, warnings, form }`. Seven write paths take the
      first and stop calling `assertNoFieldErrors` by hand; the admin hook, the
      CLI check and the forms plugin take the second.
- [x] **One name for the resource validator.** The pipeline option
      `resourceValidate` becomes `validate`, matching the config key an IDE
      lands on.
- [x] **One exported `toStoredFields` for entries**, replacing the two private
      copies and merge's inline third. It is not a parse wrapper: it inherits
      the locale group's shared fields or merges the patch, parses, then prunes
      dead relation ids. Users, media and settings do not get one; each has a
      single call site and wrapping it would be ceremony.
- [x] **Name the completeness/correctness split.** Pull step e out of
      `processScope` into `checkCompleteness` (`required`, container `min`) and
      `checkCorrectness` (the type's own validator, `max`, author rules), so
      the draft-versus-publish rule reads as one line instead of four scattered
      `ctx.validation === 'complete'` conditions.
- [x] **Fix the stale mode documentation.** `ValidationMode` and
      `FieldValidationContext.validation` in
      `packages/astromech/src/types/fields.ts` document the values as
      `'publish'` and `'save'`. They are `'partial'` and `'complete'`.
- [x] **Record it.** `TERMINOLOGY.md` gained a `Validation` entry for what
      each `validate` means now, and
      `DECISIONS.md` records why `parse` beat
      `prepare` and `validate`, why the parse takes no resource noun, and why
      the draft-versus-publish split stays.

## Constraints

No behaviour change. The existing tests were the safety net, and they held: the
only test edits were renamed symbols, 194 insertions against 194 deletions.
