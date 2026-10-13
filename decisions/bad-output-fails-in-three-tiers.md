---
area: structure
---

# Bad stored output fails in three tiers

Stored JSON such as `fields` is `unparsedJsonObject`: checked to be an object, never walked. A nullable or optional value uses `withFallback` (`packages/astromech/src/services/fallback.ts`): a stored value its schema refuses becomes the default, with one warning per call. Any other bad key fails with `OutputValidationError`, logged in full and answered as a generic 500.

**Rejected:** failing on any bad value (a stale caption takes a page down); falling back everywhere (hides a row with no `id`); path-aware `.catch` handlers (zod never tells a `.catch` its key).
