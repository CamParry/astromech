# Field validation coverage

The pipeline and its declarative surface are done — see
`completed/client-side-field-validation.md` and the P6 nested-validation work.
What remains is **coverage**: which field types actually fill the
`descriptor.validate` slot, and which checks nothing performs at all.

This matters more than a normal gap list because **the declarative rules
short-circuit on the wrong type**. `minLength` measures only strings and arrays,
`min`/`max` compare only numbers, `pattern` tests only strings — each returns
"valid" for a value of the wrong shape. So for any type with no validator of its
own, nothing is checking the value at all.

## Done 2026-08-02 (`feat/field-type-validators`)

Type validators added for every remaining field type — coverage went from 5 of
25 to **25 of 25** — and `validate` is now **required** on
`FieldTypeDescriptor`, so a new field type cannot be registered without one.
That is the structural half: the declarative rules are written to assume a
well-typed value, and nothing previously enforced that the assumption held.

The declarative rules also **fail closed** now. `minLength` against a number
reported nothing at all; it reports `Must be text or a list`. Silent-accept was
the wrong degradation mode for a data-integrity check.

Two coercions came with them, both because the validator would otherwise reject
values the system itself produces: `Date` → ISO string on `date`/`datetime` (the
forms plugin writes `submittedAt: new Date()`), and `''` → `null` on `richtext`
(a public read renders an empty document to `''`, which the pipeline treats as
absent, so it would have been stored as a string — the one bad value validation
never sees).

## Still open

- [ ] **Reference existence and target type.** `media`/`relationship` are checked
      for being an id, but nothing confirms the id resolves, or that the record
      is the declared `target` type. A dangling reference stores cleanly.
      `FieldReads` currently offers only `isUnique`, so this needs a second
      method on it and a matching change wherever the pipeline context is built
      (entries, media, users, settings).
- [x] **`color` and `link` are shape-checked, not format-checked.** `color` must
      be a string but no format is enforced; `link` must be an object with a
      string `url`, which is deliberately not parsed so a relative path or an
      anchor stays valid. Both want a real format decision.
      **Done:** `color` takes hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) and
      the `rgb()`/`rgba()`/`hsl()`/`hsla()` functions. CSS keywords like `red`
      are refused — the field's editor writes hex, so a keyword is more often a
      typo than a choice. `link` parses its url as a URL _reference_, against a
      base, so a relative path and an anchor still pass while `not a url` and
      `https://` do not; `javascript:` and `data:` are refused through the same
      `isUnsafeHref` the rich-text link guard uses. An empty url stays valid: it
      means unfilled, which is `required`'s question, not a malformed value.
- [x] **`slug` normalizes but never rejects.** `coerceSlug` slugifies whatever it
      is given, so a garbage value becomes a garbage slug rather than an error.
      Deliberate today; worth revisiting alongside `text`.
      **Done:** the `slug` field type drops its coercer and gains
      `validateSlug`, which rejects any value `slugify` would have to change and
      names the normalized form in the message. Coercion could not stay on the
      field type at all: it runs before validation, so the validator would never
      see a non-normal value. The entry-level `slug` COLUMN is a different path
      and still auto-generates through `slugify` in `entries/operations/create.ts`
      — only the `slug` FIELD type changed.
- [x] **Unknown keys survive a write.** `processFields` starts from
      `{ ...values }` and iterates only _declared_ fields, so a key belonging to
      no field is copied through untouched. Harmless under full-replace writes
      (the next write drops it), but it becomes permanent under the PATCH-merge
      semantics settled for P4 — see `completed/ai-integration.md`. Projecting
      the merged result through the schema before writing cleans these up.
      **Done:** `processFields` now projects its input through
      `projectToSchema` over the layout-flattened definitions, so an undeclared
      key is dropped silently on every write path rather than only on the three
      update paths that already called it. Silently, not rejected: the key
      belongs to no field, so there is no path to report an error under, and the
      public-shape write-back this protects (P4) legitimately carries keys the
      schema does not declare. Empty definitions still drop nothing — that means
      the schema is unknown here, not that there are no fields.
- [ ] **Validation is write-time only.** Tightening a rule does not invalidate
      rows already stored. There is no revalidation pass or report of rows that
      would now fail.

## Related

The public-shape write-back problem is tracked with P4 in
`completed/ai-integration.md`. Rich text and reference validation close the
part of it that validation can reach; the rest needs the PATCH-merge change,
because a public read that dropped a private **text** field is indistinguishable
from a deliberate clear.
