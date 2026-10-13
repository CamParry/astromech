---
area: config
---

# A site changes its database through CLI commands

A site owner changes the database only through `astromech` commands. Migrations, exports, imports and index rebuilds each have one, so a step that must follow another (migrating before an import, rebuilding the search index after it) is inside the command (`packages/astromech/src/transport/cli/index.ts`; [cli-commands](../roadmap/planned/cli-commands.md), [export-and-import](../roadmap/planned/export-and-import.md)).

**Rejected:** documenting raw `wrangler d1` or `sqlite3` steps (a reader runs them out of order or half-runs them).
