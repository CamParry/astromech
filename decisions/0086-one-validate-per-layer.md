# 0086 — One `validate` per layer, and `parseFields` keeps its verb

**Date:** 2026-08-22
**Status:** accepted

Four unrelated things were called `validate`. Following a write from
`createEntry` down to the rule that rejected a value crossed all four, and
`packages/astromech/src/entries/operations/create.ts` imported the first while
reading the second into the third, ten lines apart.

| Was                                                                     | Is                                                                                   | What it is                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `validate(schema, data)`, copied into `entries/`, `users/` and `media/` | `parseInput`, once, in `errors/validation.ts`                                        | a zod parse that rethrows `ZodError` as the framework's 422             |
| `parseFields` returning `{ values, errors, warnings, form }`            | `parseFields` returns the values and throws; `safeParseFields` returns what reported | the field pipeline                                                      |
| the `resourceValidate` option on `ParseContext`                         | `validate`                                                                           | the author's whole-resource function, which the config calls `validate` |
| `FieldType.validate`                                                    | unchanged                                                                            | a field type's own intrinsic check                                      |

`assertNoFieldErrors` is now private to `fields/parse-fields.ts`: it was only
ever called on the line after `parseFields`, which is what the throwing variant
now does.

## Why `parse` kept its verb

The pipeline strips undeclared keys, coerces, applies defaults, normalizes
container values, checks rules, and rejects. That bundle already has a name in
this ecosystem: it is what `zod.parse` does, and `projectToSchema` dropping
unknown keys is the same strip a zod object schema performs. Reaching for a
different word would mean teaching a reader that Astromech calls a familiar
thing something else.

Two candidates lost:

- **`validateFields`** hides that the function rewrites what gets stored. A
  reader who believes it only inspects values will not think to look here for
  where a default was seeded or an item `_id` was minted.
- **`prepareFields`** hides that it can fail, which is its main job. "Prepare"
  reads as bookkeeping that always succeeds, and it names an outcome rather
  than an action, which `AGENTS.md` rules out. It is also taken in the data
  layer, where a prepared statement is a precompiled query.

What was actually wrong with the name was the return type, not the verb. A
parse either yields the value or fails; this one handed back both and left a
separate assert to decide. Splitting it along zod's own `parse` / `safeParse`
line makes the name true and removes the assert from every write path.

## Why the parse takes no resource noun

`parseEntryFields` was considered and rejected. The parse is identical for
entries, media, users, settings pages and form submissions, so a resource noun
would advertise a difference that does not exist. What differs per resource is
only the context handed in: the definitions, the lookups, the resource
validator, and (for entries alone) the validation mode.

The symbol a reader wants when they ask "where is the validation for an entry"
is `toStoredFields`
(`packages/astromech/src/entries/internal/stored-fields.ts`), which already
existed as two private, same-named, different-signatured functions in
`create.ts` and `update.ts` plus a third inline copy in `staging/merge.ts`. It
is not a parse wrapper, and its name says so: it runs a pre-step (inherit the
locale group's shared fields, or merge the patch), then the parse, then a prune
of dead relation ids. A discriminated union on the write path (`create` /
`update` / `merge`) keeps the three paths' real differences visible in the type
instead of scattered across three files.

Users, media and settings get no equivalent. Each has a single call site with
the work already in one place, so wrapping it would be ceremony.

## Why the draft-versus-publish split stays

The split was questioned directly: does validating a draft differently from a
publish earn its complexity, for the framework, the admin user, or the userland
developer?

It stays, because the alternative fights the norm rather than just this CMS.
Payload's `draft: true` parameter "disables required field validation, allowing
incomplete documents to be saved", with a `drafts.validate` option to turn it
back on; Strapi enforces required fields only on publish. An editor who cannot
save half-finished work will work around the CMS instead of in it.

Astromech's version is finer than Payload's, and that is worth keeping.
Payload's flag skips validation wholesale. `ValidationMode` separates
**completeness** (`required`, a container's `min`) from **correctness** (the
field type's own validator, a container's `max`, the author's rules), so
`'partial'` still refuses to store a malformed URL in a draft.

What was wrong was that the concept had no home in the code. The two halves
were enforced by four scattered `ctx.validation === 'complete'` conditions
inside one ninety-line block, and the mode was derived at each call site via
`entryValidationMode`, so every caller had to know that helper existed.
`checkCompleteness` and `checkCorrectness` now name the two halves, and
`toStoredFields` derives the mode once.

## Rejected

- **Dropping the mode and validating every write completely.** Makes a draft
  unsavable until it is finished, which is the thing drafts exist to allow.
- **Dropping the mode and validating no write completely**, leaving `required`
  to the admin UI alone. Moves a data guarantee into one client, so the REST
  and RPC surfaces stop enforcing it.
- **A boolean `draft` parameter, as Payload has.** Reintroduces the wholesale
  skip that the completeness/correctness split exists to avoid, and names the
  caller's situation rather than what gets checked.
- **`processFields`.** Vaguer than every option it would replace.
- **Splitting the pipeline into a coerce pass and a validate pass**, so each
  name describes one job. Container normalization has to run before the
  container's own rules see the value, and defaults before that, so a split
  means two traversals of the field tree and two copies of the recursion.
- **Keeping the pipeline's option as `resourceValidate` to disambiguate it from
  the zod wrapper.** The collision was the wrapper's to fix: it was the one
  thing named `validate` that performed no validation of its own.
