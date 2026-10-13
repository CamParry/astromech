---
area: config
---

# `astro build` migrates a local database first

The integration applies migrations in `astro:build:start`, before any page compiles or prerenders, so the build reads the migrated schema (`packages/astromech/src/integrations/astro/integration.ts`). A database the driver's `isRemote()` reports as remote is left alone, with a log line naming `db:init --allow-remote`; the dev server does the same. A build that fails after migrating leaves the database ahead of the deployed code.

**Rejected:** `astro:build:done` (prerendered pages read the old schema); a documented `db:init` before every build (a reader skips it); an option letting the build migrate a remote database (duplicates `--allow-remote`).
