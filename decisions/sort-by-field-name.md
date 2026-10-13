---
area: data
---

# Lists sort by a field's bare name

`sort: { price: 'asc' }` names the field as Payload and Strapi do. A field named like a system column (`title`, `slug`, a timestamp) is allowed, and `sort` on that name orders by the column (`packages/astromech/src/entries/sort-fields.ts`).

**Rejected:** a `fields.price` prefix (exposes storage); refusing fields named like columns (breaks `title` fields); sorting in the browser (text order, one page only).
