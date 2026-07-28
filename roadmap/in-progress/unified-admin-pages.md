# Unified admin pages

Collapse `defineSettingsPage` (app) and `defineAdminPage` (plugin) into **one page primitive,
form optional** — host + plugins author with the same `defineAdminPage`, rendered by one
shared `SettingsPageForm`.

`plugin-authoring-experience.md` §2a keeps this premise and generalises it: one
helper, named for what it does rather than who calls it, with core namespacing
plugin registrations at assembly. It adds no enforcement of namespaced `path`
values — a plugin declares a bare `path` and core mounts it at
`/admin/plugin/<ns><path>` — only documentation of that derivation.

- [x] Unify the type — `AdminPage`/`ResolvedAdminPage` replacing `AppAdminPage` + `PluginPage` + `PluginSettingsSchema`; precompute `baseKey` (bare vs `plugin:<ns>:`) + permission so the renderer is origin-agnostic; XOR-validate `fields`/`component` at resolution
- [x] Promote `page/$.tsx`'s inner form to a shared `SettingsPageForm` (header save + unsaved indicator + locale switcher); both routes render it; delete `PluginSettingsPage`'s bespoke layout
- [x] Plugin settings forms move from the flat `PluginSettingsSchema` to the full `EntryFields` tree (gain sections/tabs/sidebar)
- [ ] Host pages gain the custom-`component` escape hatch (extend the plugin-components codegen to scan host `admin.pages`)
- [x] Remove `defineSettingsPage`; migrate demo Globals page + all plugin pages (`settings:` → `fields:`)
- [ ] **Investigate composition** (future) — one page rendering **both** a managed form and custom widgets (Sanity-style view tabs, or a custom component mounting managed form regions via a `useSettingsForm` hook). XOR ships first; keep the `AdminPage` type open so this is additive
