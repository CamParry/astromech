---
area: structure
---

# The audit trail records that a write ran

Every `mutates: true` call writes one row from `bind()`, for the outermost call only: method, target, user id and email at the time, origin, outcome, time, and the version the write took, as Directus's `directus_activity` points to `directus_revisions` ([audit trail](../roadmap/planned/audit-trail.md)). The user id has no foreign key, so the row outlives the user.

**Rejected:** request and response bodies (Strapi; copies values the field rules hide); logging reads; a nulled or cascaded user column (erases who); core absorbing the assistant's approval decisions; model calls in the trail.
