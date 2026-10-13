---
area: config
---

# A plugin's config view is an explicit `Pick`

`ctx.config` names each config field a plugin may read (`PluginConfigView` in `packages/astromech/src/types/plugins.ts`). A field added to the resolved config stays hidden from plugins until someone names it there.

**Why:** a plugin must reach shared backends only through its own handles, such as `ctx.storage` with its key prefix, never through the config.

**Rejected:** spreading the config; a strip list (exposes every new field by default).
