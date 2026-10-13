---
area: structure
---

# Plugin data lives in plugin tables

Every entry type lives in the entries tables. A plugin's other data gets its own table (`definePluginTable`), a repository from `createRepository` over `ctx.db`, and service methods checked with `parseFields`, so a 422 fills the admin form. Users and media have no repository seam either; media's seam is the bytes (`StorageDriver`).

**Why:** an entry is close to a WordPress post, and WordPress and Craft give lookup data its own tables (Redirection, Retour).

**Rejected:** custom-table entry types (about 760 lines of core branches); an entry type for plugin data (unused versions, locales, slugs and statuses).
