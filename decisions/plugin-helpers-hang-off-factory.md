---
area: structure
---

# Plugin helpers hang off the plugin factory

A site calls a plugin's config-time functions off its factory: `seo.section()`, beside `seo.permissions()`. Each of a plugin's `helpers` takes the plugin's resolved identity first, and `definePlugin` binds it (`packages/astromech/src/plugins/define-plugin.ts`), so neither side writes a namespace.

**Rejected:** a helper deriving the namespace from its package name (two sources for one fact); a plugin that transforms the site's config, as Payload's do (the site loses placement); a second `definePlugin` argument; curried `helpers` (hides the keys); a Proxy (types cannot see its keys).
