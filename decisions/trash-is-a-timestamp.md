---
area: data
---

# Trash is a timestamp, at two levels

`deletedAt` on an entry trashes every locale, and `deletedAt` on a content row trashes one locale ([locale-trash](../roadmap/planned/locale-trash.md)), as WordPress translation plugins and EmDash allow.

**Why:** status is per locale and about publishing, and a trashed entry keeps the status it returns to.

**Rejected:** a `trash` status (WordPress; must store the old status); only a permanent per-locale delete (Strapi, Craft; cannot be undone); one call with `cascadeLocales` (merges two operations).
