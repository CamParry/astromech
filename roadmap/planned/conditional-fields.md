---
milestone: 1.0
---

# Conditional fields

A field cannot be shown or hidden by another field's value. Raised on
2026-10-03; decided the same day.

## What exists

- Field definitions reach the admin as JSON
  (`virtual:astromech/admin-config`, built in
  `packages/astromech/src/integrations/astro/vite.ts`), so functions never reach
  the browser: a `{ custom: fn }` rule arrives as `{}`.
- The browser and the server run one validation pipeline
  (`packages/astromech/src/fields/parse-fields.ts`), which addresses nested
  items by their stored `_id` (`packages/astromech/src/fields/field-path.ts`).
- The query language's `where` (`packages/astromech/src/database/repository/where.ts`)
  has the operators `eq`, `ne`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`,
  `like` and `contains`; sibling keys combine with AND, and `or` takes a list.

## Prior art

- **Payload:** `admin.condition(data, siblingData, …)`, a function; the server
  re-runs it and skips validation for hidden fields; hidden values are kept.
- **Strapi 5.17:** JSON Logic in the schema, evaluated inside components and
  dynamic zones, re-evaluated on the server, which skips validation for hidden
  fields.
- **Directus:** declarative rules in its filter syntax that can hide, make
  read-only or required; hidden values kept unless `clear_hidden_value_on_save`.
  Evaluated in the browser only.
- **Statamic:** `if`/`unless` with `is`, `>`, `contains` and others; siblings by
  default, `$parent.` and `$root.` for others; evaluated per replicator item.
- **Sanity:** a `hidden` function, values kept, Studio-only validation.
- **Craft:** a condition builder; only visible fields are validated.
- **Kirby:** `when: { field: value }`, equality only; values kept.

## Decided (2026-10-03)

- **A declarative `condition` on a field**, in the query language's shape:
  `condition: { kind: { eq: 'video' } }`, sibling keys combining with AND and
  `or` taking a list. Operators: `eq`, `ne`, `in`, `notIn`, `gt`, `gte`, `lt`,
  `lte`, `contains`, and `empty` (true or false). Rejected: a function
  (Payload, Sanity), which cannot reach the admin; and JSON Logic (Strapi), a
  second grammar beside `where`.
- **References:** sibling fields by default; `$parent.` and `$root.` reach
  others (Statamic). Inside a repeater or block, a condition reads that item's
  own values.
- **Hidden values are kept and returned as stored.** The site checks the
  controlling field. An option to clear a hidden value comes later.
- **The server evaluates the same condition.** A hidden field skips `required`
  and its rules, and still has its type checked. Rejected: evaluating in the
  browser only (Directus, Sanity).
- **Visibility only in 1.0.** Conditional `required` and read-only come later.

## The work

- [ ] The `condition` option and its type, with a config check that every
      referenced field exists.
- [ ] One evaluator in `astromech/shared`, used by the admin form and the field
      pipeline.
- [ ] The pipeline: hidden fields skip completeness and rules.
- [ ] The admin: hide and show as values change, including inside repeaters,
      blocks, groups and tabs.
- [ ] Docs in `apps/docs/content/fields.md`.

## Testing

A hidden required field saves empty; a visible one does not; a hidden field
with a wrong type is refused; `$parent.` and `$root.` resolve inside a nested
block; a hidden value survives a save and is returned by a read; a condition
naming a missing field fails at config load.
