# Plugin types in core's registries

A plugin's entry types, globals and field types live in the same registries as
the site's, keyed by id, so nothing downstream branches on "is this a plugin".
Strapi's `plugin::` UIDs and Payload's plugin collections, which are just
collections, are the model.

## Why

`ResolvedConfig` kept `entries` beside `pluginEntries` and `globals` beside
`pluginGlobals`, so every consumer iterated twice (the permissions catalogue,
codegen, the method manifest, the admin config, the CLI validator, the
relationships rebuild) and lookups split the id on `/`. The admin config
carried a second map per plugin, and repositories were registered in two loops.

## The work

- [x] `ResolvedConfig.entryTypes` and `globals` keyed by id (bare for the site,
      `plugin/type` for a plugin), each value carrying `plugin?`; `pluginEntries`
      and `pluginGlobals` deleted; `resolveEntryType` and `resolveGlobal` are
      own-property map reads. **Public API** (`ResolvedConfig`,
      `PluginConfigView`).
- [x] Iterate once in the permissions catalogue, codegen, the method manifest
      and its tool names, the admin config, the CLI validator, the
      relationships rebuild, `GET /entry-types` and repository registration.
- [x] One admin config map per kind (`AdminConfig.entryTypes`, `globals`);
      plugin admin URLs stay, resolved through the same lookup.
- [x] Plugin services: `buildXService` → `createXService`, short keys
      (`backups.list`), verb keys for seo (`getSitemap`), `seo:view` →
      `seo:read`. **Public API**.
- [x] Guard: one fixture plugin type and global asserted in the permissions
      catalogue, codegen, the method manifest, the admin config and the CLI
      validator (`tests/plugins/plugin-types-in-registries.test.ts`).

## What stays, and where it went

- The admin's `/plugin/$name/entries/$type` routes, the bindings and
  `cacheScope`: `admin-resource-views.md` replaces the bindings with
  `useAdminEntryType(typeId)` and the scoped key factories with one keyed by
  type id.
- The two plugin-method HTTP routes: a live choice in `DECISIONS.md` ("A route
  declares itself").
- `entryPermission` and `globalPermission` derive the permission from the id,
  since a site's roles are written before any config resolves.
