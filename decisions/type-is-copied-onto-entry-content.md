---
area: data
---

# `type` is copied onto `entry_content`

`entry_content` holds copies of the entry's `type` and trashed flag, and nothing else, because an index cannot reach across the join (`packages/astromech/src/entries/tables.ts`).

**Rejected:** slug uniqueness in application code (Craft).
