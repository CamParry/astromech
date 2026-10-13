---
area: structure
---

# Plugin reads answer the public shape

`ctx.entries` and `ctx.globals` read as a site's own code does, and a plugin reading its own settings or rules passes `full: true`.

**Rejected:** defaulting plugin reads to the full shape as trusted server code (a public plugin method, such as the menus plugin's, can then resolve URLs for unpublished, scheduled and trashed entries).
