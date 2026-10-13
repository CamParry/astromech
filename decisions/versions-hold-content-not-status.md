---
area: structure
---

# A version holds content, not publication state

The version tables have no `status` column, a status change alone writes no version (`changesVersionedContent` in `packages/astromech/src/content/versions.ts`), and a restore leaves the current status alone, as WordPress does (`wp-includes/revision.php`). [History](../roadmap/planned/history.md) replaces versions with records of published states.

**Rejected:** a status on each version (Payload 3, Strapi 5, Craft 5): with no version written on a status change, it would record the moment of the next content edit, not publication.
