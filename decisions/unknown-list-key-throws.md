---
area: data
---

# Unknown list keys throw

An unknown sort key throws on every list (`packages/astromech/src/content/list.ts`), and an unknown entries `where` key throws (`packages/astromech/src/entries/errors.ts`); media's `where` fails schema validation.

**Rejected:** ignoring it (silently answers every row); warning (nobody reads server logs).
