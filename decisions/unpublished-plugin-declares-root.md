---
area: structure
---

# An unpublished plugin declares its root

A plugin that is not a published package, such as one inside a site, passes `root: import.meta.url` to `definePlugin`, and its relative asset paths (admin pages, field components, locale files) resolve against it (`apps/demo/src/plugins/rating/index.ts`). A published plugin omits it, and its paths resolve through its package name.

**Why:** `definePlugin` cannot learn its caller's URL reliably.

**Rejected:** parsing a stack trace, or a build-time transform (both mis-resolve silently across bundlers).
