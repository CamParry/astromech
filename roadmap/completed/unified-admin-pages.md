# Unified admin pages

Collapse `defineSettingsPage` (app) and `defineAdminPage` (plugin) into **one page primitive,
form optional** — host + plugins author with the same `defineAdminPage`, rendered by one
shared `SettingsPageForm`.

**Shipped 2026-08-03** — `defineSettingsPage`, `AppAdminPage`, `PluginPage`,
`PluginSettingsSchema` and `PluginSettingsPage` are all gone from the codebase;
`page/$.tsx` and `plugin/$.tsx` both render `SettingsPageForm`. The one open
question — composing a managed form _and_ custom widgets on one page — is
additive to the shipped `AdminPage` type and now sits in `roadmap/backlog.md`.

`plugin-authoring-experience.md` §2a keeps this premise and generalises it: one
helper, named for what it does rather than who calls it, with core namespacing
plugin registrations at assembly. It adds no enforcement of namespaced `path`
values — a plugin declares a bare `path` and core mounts it at
`/admin/plugin/<ns><path>` — only documentation of that derivation.

- [x] Unify the type — `AdminPage`/`ResolvedAdminPage` replacing `AppAdminPage` + `PluginPage` + `PluginSettingsSchema`; precompute `baseKey` (bare vs `plugin:<ns>:`) + permission so the renderer is origin-agnostic; XOR-validate `fields`/`component` at resolution
- [x] Promote `page/$.tsx`'s inner form to a shared `SettingsPageForm` (header save + unsaved indicator + locale switcher); both routes render it; delete `PluginSettingsPage`'s bespoke layout
- [x] Plugin settings forms move from the flat `PluginSettingsSchema` to the full `EntryFields` tree (gain sections/tabs/sidebar)
- [x] Host pages gain the custom-`component` escape hatch (extend the plugin-components codegen to scan host `admin.pages`)
- [x] Remove `defineSettingsPage`; migrate demo Globals page + all plugin pages (`settings:` → `fields:`)
