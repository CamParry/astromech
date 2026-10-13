---
area: structure
---

# Choosing a status or date needs `publish`

An `update` whose `data` names `status` or `publishedAt` needs `publish` beside `update`; a `create` or `duplicate` needs it only to choose a status other than `unpublished`, or a date. `needsPublish` (`packages/astromech/src/content/publish-access.ts`) decides from the payload alone, so one call always needs one permission. A client saving for a role without `publish` leaves both keys out.

**Rejected:** needing `publish` only when the value changes (reads the row before the access check); dropping the keys silently, as Strapi 5 and Payload do (a 200 for a write that did not happen).
