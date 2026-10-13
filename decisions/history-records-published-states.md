---
area: data
---

# History records published states

A history record is written only when what is live changes, never for a draft save, into a history table per resource keyed on id and locale ([history](../roadmap/planned/history.md)).

**Why:** Ghost, Strapi, Directus and EmDash keep history apart from live content.

**Rejected:** history rows in the content table (WordPress, Craft, Umbraco; every query filters them); mirrored tables with a `latest` flag (Payload; duplicate rows on D1); live and draft pointers (EmDash; they drift); snapshots before each write (the newest is not current); "versions" (implies the newest is live).
