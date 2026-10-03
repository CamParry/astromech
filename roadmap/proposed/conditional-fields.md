# Conditional fields

A field cannot be shown or hidden by another field's value. Raised on
2026-10-03. **Target: 1.0.**

## Prior art

- **Strapi:** conditional fields, 520 votes on its feedback board, now shipped.
- **Directus** (issue #3151), **Sanity** (#677), **Craft 4**, **Storyblok** and
  **Keystatic** all ship them.
- **Payload** uses an `admin.condition` function, which works because its
  config is bundled into the admin.

## Proposal

- Field definitions reach the admin as JSON
  (`packages/astromech/src/transport/http/routes/entry-types.ts`), so a
  condition is declarative, for example `when: { field: 'kind', equals: 'video' }`,
  with a small set of operators and `and`/`or`.
- The server evaluates the same condition: a hidden field is not `required`,
  and its value is either kept or dropped on save.

## Open questions

- Is a hidden field's value kept or cleared on save?
- Can a condition read a sibling inside a repeater or block, or the parent?
- Which operators: equals, not equals, in, is empty, and comparisons?
