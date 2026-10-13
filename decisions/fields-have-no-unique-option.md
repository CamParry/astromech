---
area: data
---

# Fields have no `unique` option

Field values live in one JSON column, so `unique` could only be a racy scan of every row. A plugin keeps a unique value in its own indexed column, as `@astromech/redirects` does; field uniqueness returns with [field-value query indexing](../roadmap/planned/field-value-query-indexing.md).

**Why:** Payload and Directus back `unique` with a column index ([Payload's drizzle adapter](https://github.com/payloadcms/payload/blob/228dd618f8f98a8d10476c865d7b532939b2ce04/packages/drizzle/src/schema/traverseFields.ts#L153-L174)).

**Rejected:** the scan (reads as a guarantee it cannot give).
