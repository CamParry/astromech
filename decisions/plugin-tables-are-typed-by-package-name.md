---
area: config
---

# Plugin tables are typed by package name

A plugin types its tables onto the site's `db` handle by extending `AstromechPluginTables` in its own source. `definePluginTable` takes the package name, so a plugin with tables keeps it in a constant (`packages/astromech/src/database/define-plugin-table.ts`). A plugin in the program but not in the config still adds its types.

**Rejected:** generating declarations into `.astro/` (a plugin's tables are fixed by its package); `defineTable` with names prefixed at registration (does not compile; leaves `table.name` unprefixed); a plugin helper (bound after the tables exist).
