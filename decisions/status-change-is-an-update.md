---
area: structure
---

# A status change is an update

`publish`, `unpublish` and `schedule` write through the resource's update path (`packages/astromech/src/entries/internal/update-batch.ts`, `packages/astromech/src/globals/internal/update-global.ts`), so they fire the update hooks with the status in `data`, as Payload and WordPress's `wp_publish_post` do. Moving to `published` or `scheduled` checks the stored fields for completeness. The `scheduled-publish` job takes the same path and skips a row no longer scheduled for that date.

**Rejected:** a status change outside the update hooks (plugins miss it, and `required` goes unchecked); one bulk `UPDATE` per resource for due rows.
