# Menus, `tree` field & clean settings translation

Three independently-shippable deliverables, in order.

- [x] **Settings translation cleanup** (prerequisite) — unify app-page + plugin-page settings on one object-blob-per-page shape (`<base>` + `<base>:<locale>`); extract a shared `saveSettingsPage` (partition + write) both renderers call; bring `PluginSettingsPage` to parity (blob load, locale switcher, `PluginPage.translatable`); migrate per-field plugin-settings consumers (seo, demo rating) off `plugin:<ns>:<field>` reads. Top-level-field granularity
- [x] **`tree` core field type** — generic recursive nested builder (`repeater` + `_children` axis), drag-to-nest (dnd-kit depth-projection; indent/outdent fallback), `maxDepth`, reserved `_id`/`_disabled`/`_children`, terminating recursive type-gen. No menu/URL semantics
- [x] **`@astromech/menus` plugin** — developer-declared menu set via `menus({ menus: [{ key, label }] })`; one generated `defineAdminPage` settings page (single `tree` field) + nav child per menu; data in settings (not entries/own-table); `menus.get(key, { locale })` resolves entry refs → URLs via `resolveEntryUrl`, custom-URL/label fallback; replaces the demo Globals-repeater menus
