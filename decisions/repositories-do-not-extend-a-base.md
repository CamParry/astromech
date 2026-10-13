---
area: structure
---

# Resource repositories do not extend a base

`createContentRepository` (`packages/astromech/src/content/repository/content-table.ts`) holds what the three-table schema fixes and the reads that repeat unchanged. Each resource writes its own list filter, count, sort, search and fallback, and hand-picks from the content repository rather than spreading it, so one changes without moving the others. Payload, Strapi and Keystone keep one generic implementation instead.

**Rejected:** a base each resource extends, as Directus's `ItemsService` is (a change is checked against every override); spreading the content repository (extension in practice).
