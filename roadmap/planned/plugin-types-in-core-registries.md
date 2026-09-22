# Plugin types in core's registries

A plugin's entry types, globals and field types live in the same registries as
the site's, keyed by id, so nothing downstream branches on "is this a plugin".
Strapi's `plugin::` UIDs and Payload's plugin collections, which are just
collections, are the model.

## Why

`ResolvedConfig` keeps `entries` beside `pluginEntries` and `globals` beside
`pluginGlobals`, so every consumer iterates twice
(`permissions/catalogue.ts`, `codegen/type-generator.ts`,
`config/admin-config.ts`, `transport/cli/validate-stored-content.ts`) and
lookups branch on the `/` separator (`entries/entry-types.ts`,
`globals/internal/global.ts`). The same split shows in the admin's plugin route
tree and `cacheScope`, the admin-only plugin field types, the two
plugin-method HTTP routes and the plugin-only `withDefaultShape`.

## The work

- [ ] `ResolvedConfig.entryTypes` and `globals` keyed by id (bare for the site,
      `plugin/type` for a plugin), each value carrying `plugin?`; delete
      `pluginEntries` and `pluginGlobals`; `resolveEntryType` and the globals
      lookup become one map read. **Public API** (`ResolvedConfig`,
      `PluginConfigView`).
- [ ] Iterate once in `permissions/catalogue.ts`, `codegen/type-generator.ts`,
      `config/admin-config.ts` and `transport/cli/validate-stored-content.ts`.
- [ ] One admin config map per kind; plugin admin URLs can stay, resolved
      through the same lookup.
- [ ] Plugin services: `buildXService` → `createXService`, short keys
      (`backups.list`, not `listRuns`), verb keys for seo (`getSitemap`),
      `seo:view` → `seo:read`. **Public API** (stored role permissions).
- [ ] Guard: one fixture plugin type asserted in the permissions catalogue,
      codegen, admin config and the CLI validator.

Depends on `field-tree-traversal.md` (plugin field types) and
`policy-in-the-service-layer.md`.
