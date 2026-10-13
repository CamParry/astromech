---
area: config
---

# A D1 binding is remote unless shown local

`d1().isRemote()` reads the wrangler config as `getPlatformProxy()` does and answers false only for a binding declared without `"remote": true` (`packages/astromech/src/integrations/cloudflare/bindings.ts`). A missing wrangler, an unreadable config, an undeclared binding, a `d1({ database })` object and a Worker all answer true, so `--allow-remote` is needed whenever the CLI cannot show the database is local.

**Rejected:** always remote (`--allow-remote` becomes a habit that guards nothing); inferring from `database_id` (local emulation reads it too).
