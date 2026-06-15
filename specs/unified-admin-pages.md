# Unified admin pages

Status: planned. Supersedes the split between `defineSettingsPage` (app) and
`defineAdminPage` (plugin) and the two divergent settings-form renderers.

## Mental model (decided across discussion)

**One page primitive, form optional** — the pattern the best-DX systems converge on
(Filament: "everything is a Page, a form is opt-in"; Sanity: form + custom views are
composable view types on one document). The dual-primitive camp (Payload globals-vs-
collections, WordPress Settings-API-vs-ACF) is explicitly the thing to avoid — it forces
an early "is this a page or a global?" choice and makes mixing form + custom UI awkward.

So Astromech has **one builder, `defineAdminPage`**, used by **both the host app and
plugins**, rendered by **one shared renderer**:

- Give a page `fields` → a **managed settings form**. The framework owns load, save,
  dirty-tracking, locale switching, and i18n partition. Header save button + unsaved
  indicator + locale switcher come for free.
- Give a page a `component` → a **fully custom React page**. The developer owns everything
  (data, save, layout) inside the page shell + error boundary + plugin context.
- **v1 is XOR**: exactly one of `fields` / `component`. Composition (a custom component
  that *also* renders managed form regions, Sanity-style) is a deliberate later
  investigation — see Roadmap.

The only host-vs-plugin difference is **internal**: a plugin page's settings blob is
namespaced (`plugin:<ns>:<path>`) and its permissions are plugin-scoped; a host page uses
a bare key (`<path>`) and core `settings:*` permissions. Both differences are precomputed
into the resolved config so the renderer never branches on origin.

## What this removes

- `defineSettingsPage`, the `AppAdminPage` / `ResolvedAppAdminPage` types — folded into
  the unified `AdminPage` / `ResolvedAdminPage`.
- The bespoke inner form in `src/admin/pages/_protected/page/$.tsx` — promoted to a shared
  `SettingsPageForm`.
- `PluginSettingsPage.tsx`'s weaker layout (bare panel, save-below-form, no dirty
  indicator) — it renders the shared form, so plugin settings pages **gain** the proper
  header layout.
- `PluginSettingsSchema` (the plugin's flat field array) — replaced by the full
  `EntryFields` tree, so plugin settings pages **gain** sections / tabs / sidebar.

## What it builds on (already done)

The settings-translation cleanup (one object-blob-per-page storage shape + shared
`saveSettingsPage` partition/write helper) already landed. This unification is therefore
mostly a **view + type** consolidation, not a storage migration. The field tree already
provides `section`/`tab`/`accordion`, so "multiple settings groups on one page" needs no
new primitive.

---

## The unified type

```ts
// One shape for host + plugin pages.
type AdminPage = {
  path: string;                 // host: route + storage key; plugin: relative to /plugin/<name>
  label: Label;                 // Label (string | i18n descriptor) — host pages were already Label
  icon?: string;                // Lucide icon name
  fields?: EntryFields;         // MODE A: managed settings form (full tree: main/sidebar, sections…)
  component?: string;           // MODE B: custom React (import specifier)
  translatable?: boolean;       // settings-form mode only; default false
  permission?: string;          // optional override; defaults below
  nav?: boolean;                // default true
};
// Constraint: exactly one of `fields` / `component`. Validated at config resolution
// (crash-loud, like the current plugin-admin check).
```

```ts
export function defineAdminPage(page: AdminPage): AdminPage {
  return page;
}
```

- **Host** authors into `admin.pages: AdminPage[]` (the existing `admin.pages` slot;
  `defineSettingsPage` removed).
- **Plugins** author into `PluginDefinition.admin.pages: AdminPage[]` (replacing
  `PluginPage`).

### Resolved shape (origin-erased)

Both host and plugin derivation produce one shape, with the storage key and permission
**precomputed** so the renderer is origin-agnostic:

```ts
type ResolvedAdminPage = {
  key: string;                  // route splat key (host: path; plugin: '<name><path>')
  path: string;
  label: Label;
  icon?: string;
  baseKey: string;              // settings storage base — host: '<path>'; plugin: 'plugin:<ns>:<path>'
  fields: ResolvedEntryFields | null;   // null in component mode
  componentKey: string | null;  // lazy-import registry key; null in settings mode
  translatable: boolean;
  permission: string | null;    // resolved (host default 'settings:read'; plugin default per current rules)
  nav: boolean;
};
```

- Host derivation: `baseKey = path`, `permission ??= 'settings:read'`.
- Plugin derivation: `baseKey = 'plugin:' + ns + ':' + path`, permission resolution
  unchanged from today (bare keys auto-namespaced; settings pages default `settings:read`).

---

## Renderer

Extract the chrome currently inside `page/$.tsx`'s `AppPageForm` into a shared component:

```ts
// src/admin/components/pages/SettingsPageForm.tsx (new)
function SettingsPageForm(props: {
  baseKey: string;
  fields: ResolvedEntryFields;
  label: Label;
  translatable: boolean;
  readOnly: boolean;
}): React.ReactElement
```

It owns: query-load + synchronous seed, dirty tracking, `<Page>`/`<PageHeader>` shell with
the **header save button + unsaved-changes indicator + locale switcher**, and save via
`saveSettingsPage({ baseKey, fields, values, translatable, locale })`. This is the *good*
existing app-page implementation, lifted verbatim and parameterized by `baseKey`.

- **Host route** `page/$.tsx`: looks up the page in `adminConfig.pages`; if `fields`,
  render `SettingsPageForm`; if `component`, render the lazy component (see below).
- **Plugin route** `plugin/$.tsx`: unchanged lookup; settings pages render the **same**
  `SettingsPageForm` (delete `PluginSettingsPage`'s bespoke layout); component pages
  unchanged.

### Custom component mode (both origins)

Host pages gain the custom-component escape hatch that plugins already have — that's the
point of "one interface for settings *or* widgets." The code-gen that scans plugin
`component` specifiers (`virtual:astromech/plugins/components` in `src/adapters/astro.ts`)
also scans host `admin.pages` with a `component`, emitting lazy imports under the same
registry. The host route renders the lazy component in the standard `<Page>` shell +
`PluginErrorBoundary` (host pages get the same boundary; no plugin context provider for
host pages — or a neutral one).

> If we want to keep scope minimal, host custom-component pages can be the one piece
> deferred — but then the interface isn't fully uniform. Default: include it.

---

## Routing & nav

- **Routes stay split**: host `/page/<path>`, plugin `/plugin/<name><path>`. The authoring
  *interface* is one; the URL namespace difference is a reasonable internal detail
  (plugin pages are namespaced). No plugin-URL churn.
- **Nav unchanged in placement**: host pages in the flat "Pages" group; plugin pages under
  their plugin group. Both already drive off the resolved config.

---

## Migration surface (pre-release, no data migration)

1. **Types** — introduce `AdminPage` / `ResolvedAdminPage`; remove `AppAdminPage`,
   `ResolvedAppAdminPage`, `PluginPage`, `PluginSettingsSchema`. Update
   `src/types/config.ts`, `src/types/plugins.ts`, `src/core/plugin-admin.ts`,
   `src/adapters/astro.ts` (admin-config + plugin-components codegen).
2. **Builders** — `defineAdminPage` is the single export; delete `defineSettingsPage`
   from `src/index.ts`.
3. **Renderer** — add `SettingsPageForm`; rewrite `page/$.tsx` to use it; rewrite the
   settings branch of `plugin/$.tsx` to use it; delete `PluginSettingsPage.tsx`.
4. **Consumers** —
   - demo host pages: `defineSettingsPage(...)` → `defineAdminPage(...)`
     (`demo/astromech.config.ts`, the Globals page).
   - plugin settings pages already use `defineAdminPage`; just confirm `fields` (was
     `settings`) naming and that the full tree renders (`src/plugins/seo/pages/settings.ts`,
     `src/plugins/menus/*`, `demo/src/plugins/rating/pages/settings.ts`).
   - rename `settings:` → `fields:` on every plugin page that declared a form.
5. **Validation** — the XOR check (exactly one of `fields`/`component`) moves into config
   resolution for both origins.

## Tests

- `defineAdminPage` round-trips both modes; XOR violation throws at resolution.
- Resolved `baseKey` is bare for host, namespaced for plugin.
- `SettingsPageForm` loads the blob, partitions on save, switches locale, shows the dirty
  indicator (one component, both origins).
- Plugin settings page renders a full field tree (section/tab), proving the
  `PluginSettingsSchema` → `EntryFields` upgrade.
- Host custom-component page lazy-loads and renders (if host components are included).

## Out of scope (→ Roadmap investigation)

Composition — a single page rendering **both** a managed form and custom widgets
(Sanity-style view tabs, or a custom component that mounts managed form regions via a
`useSettingsForm` hook). Keep the `AdminPage` type open so this is additive.
