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

Type validators added for `richtext`, `select`, `radio-group`, `multiselect`,
`checkbox-group`, `number`, `range`, `boolean`, `date`, `datetime`, `media` and
`relationship`. Coverage went from 5 of 25 types to 17.

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
      `ScopedReads` currently offers only `isUnique`, so this needs a second
      method on it and a matching change wherever the pipeline context is built
      (entries, media, users, settings).
- [ ] **Types with no validator at all:** `text`, `textarea`, `color`, `link`,
      and the `group`/`repeater`/`tree` containers. `text`/`textarea` want a
      string check; `color` needs a format decision before it can have one;
      `link` is an object (`{url, label, target?}`) whose shape is unchecked; the
      containers validate their children but never their own shape.
- [ ] **`slug` normalizes but never rejects.** `coerceSlug` slugifies whatever it
      is given, so a garbage value becomes a garbage slug rather than an error.
      Deliberate today; worth revisiting alongside `text`.
- [ ] **Unknown keys survive a write.** `processFields` starts from
      `{ ...values }` and iterates only _declared_ fields, so a key belonging to
      no field is copied through untouched. Harmless under full-replace writes
      (the next write drops it), but it becomes permanent under the PATCH-merge
      semantics settled for P4 — see `in-progress/ai-integration.md`. Projecting
      the merged result through the schema before writing cleans these up.
- [ ] **Validation is write-time only.** Tightening a rule does not invalidate
      rows already stored. There is no revalidation pass or report of rows that
      would now fail.

## Related

The public-shape write-back problem is tracked with P4 in
`in-progress/ai-integration.md`. Rich text and reference validation close the
part of it that validation can reach; the rest needs the PATCH-merge change,
because a public read that dropped a private **text** field is indistinguishable
from a deliberate clear.
