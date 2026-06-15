# Plugin Architecture

**Status:** Designed (2026-05-29); 18a/18b implemented. **Partially superseded (2026-06-10)** by [[unified-architecture.md]] — plugin entry types are now namespaced (never merged into root `config.entries`), the entries API mounts per plugin namespace, permission grammar moves to `resource:identifier:action` with owner-first plugin trees, `suggestedRoleGrants` is replaced by permission bundles, hooks become an array of `defineHook` results, and "specified SDK methods only" is superseded by auto-exposed namespaced entries. Sections here remain authoritative where not contradicted; see unified-architecture.md §6 for the precise list.
**Supersedes:** [[plugins.md]] (early design sketch — `targets` injection, `collections`, `hooks.on()`, the translations plugin, and positional SDK calls are all obsolete).
**Touches:** `src/types/plugins.ts`, `src/types/hooks.ts`, `src/core/plugin-resolver.ts`, `src/core/config-resolver.ts`, `src/index.ts` (`definePlugin`), `src/adapters/astro.ts` (Vite plugins / virtual modules), `src/core/type-generator.ts`, `src/sdk/{local,fetch}`, `src/core/permissions.ts`, `src/cron/registry.ts`, `src/db/schema.ts`, new `src/api/plugins/*`.

---

## 1. Background & Motivation

The current plugin surface (`src/types/plugins.ts`) is an object literal with `fieldGroups` (target-based injection), `entries`, `setup(hooks, ctx)`, `routes`, and `middleware`. Two structural problems block it from shipping real plugins:

1. **`routes`/`middleware` are typed against raw `Request`/`Response` but never mounted.** The resolver (`src/core/plugin-resolver.ts`) only merges field groups and entry types and collects email overrides — `routes` and `middleware` go nowhere. This is the central gap.

2. **`virtual:astromech/config` is built by `JSON.stringify(resolvedConfig)`.** Plugins carry **functions** — SDK handlers, hooks, React components, cron handlers — which do not survive JSON serialization. Therefore any plugin-bearing virtual module must be **code-generating** (emit real `import` statements), not data-serializing. This constraint drives the entire build-pipeline design (§14).

Beyond the gap, the design was reworked around composability: the dynamic `targets` field-injection mechanism is **removed** in favour of explicit attachment (Filament-style), and the closed hook enum becomes an **open registry**.

The reference target is the way Payload / Strapi / Sanity treat plugins: **a plugin is a server-side thing**; the frontend consumes it via the API plus framework-agnostic helpers. Astromech is a **developer CMS** (code-first config, trusted npm packages), not a content-editor/marketplace CMS — so we deliberately diverge from EmDash's sandboxed, DB-mutable, per-collection-table model (see §16).

---

## 2. Terminology (Ubiquitous Language)

The design introduced several near-synonyms that must stay distinct:

| Term                       | Meaning                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **canonical package**      | The npm package name, e.g. `@astromech/redirects`. The stable identity that survives renames.                                                                                                               |
| **access key** (`name`)    | The key a plugin is reached by on the SDK: `Astromech.plugins.redirects`. Defaults to the last path segment of the package; user-overridable via `alias`.                                                   |
| **permissionNamespace**    | Sanitised package (`@`→stripped, `/`→`-`, lowercased) used to anchor permission strings: `plugin:astromech-redirects:lookup`. Always derived from the package (no override) so it survives `alias` renames. |
| **plugin footprint**       | The set of entry types that actually use a plugin. **Derived** from field presence (`ctx.config.entryTypesWithField('seo')`), never declared.                                                          |
| **field-group placement**  | Where a field group renders on the edit page: `'main' \| 'sidebar' \| 'tab'`. Replaces the old panel/tab API.                                                                                               |
| **hook event**             | A named lifecycle point. Core events are known/typed; plugins declare their own via `hookEvents` and fire them with `ctx.emit(event, payload)`.                                                             |
| **raw escape hatch**       | A raw request handler mounted inside `/api/plugins/{name}/*` for binary/multipart/streaming, via a thin wrapper (not raw Hono).                                                                             |
| **declarative definition** | The plugin object is almost entirely data; `setup(ctx)` is the only imperative escape hatch.                                                                                                                |

---

## 3. Decisions (Locked)

### 3.1 Plugin shape & identity

1. **`definePlugin` accepts a factory** `(options) => PluginDefinition`. First-party plugins export a function (`redirects()`, `seo()`, `forms()`) callable with **zero args**; `options` is always optional / `Partial`. The author validates options inside the factory (Zod recommended, not enforced).
2. **Identity** = `package` (canonical) + `name` (access key, defaults to last path segment). Name collisions → **build error**; the user resolves via an `alias` option.
3. **`permissionNamespace`** = sanitised package, always derived (no override). Permissions anchor to the package, not the alias.

### 3.2 Distribution & frontend

4. A plugin is **one npm package, framework-agnostic**, with sub-path exports:
    - `index` — `definePlugin` factory (server).
    - `/client` — pure-JS helpers (no React).
    - `/components` — pure React (works in any React framework).
5. **Framework adapters live outside the plugin** — README recipes or sibling packages. **No `astromech/redirects/astro` sub-paths.** No deep integration with `@astrojs/sitemap` / `astro-seo`.
6. **Plugins cannot register routes outside `/api`.** Sitemap / robots / redirect-interception: the plugin exposes _data_ via the SDK; the **user** creates the framework route (e.g. `/sitemap.xml`) themselves.

### 3.3 SDK + API parity

7. `Astromech.plugins.X.method()` works **identically** in both `astromech/local` (DB) and `astromech/fetch` (HTTP), via code-gen virtual modules. Same call site regardless of runtime.
8. A plugin defines an **`sdk` object once** (the `local` handler). The HTTP API is **auto-mounted** at `/api/plugins/{name}/{method}` (RPC: `POST`, JSON in/out); the fetch shim is **auto-generated**.
9. Every SDK method **must declare `access`** — no default; omitting it is a **build error**:
   `'public' | 'authenticated' | { permission: '<action>' }`. The framework enforces against `c.var.user` automatically.
10. **Raw-route escape hatch** (minimal, in scope): for binary/multipart/streaming (Forms file uploads). A raw handler mounted **inside** `/api/plugins/{name}/*`, via a **thin wrapper, not raw Hono**, so the underlying HTTP infra stays swappable.

### 3.4 Fields & edit page

11. **Field injection is explicit attachment only.** The user composes plugin field factories into their entry-type `fields` (Filament-style): `fields: [...ownFields, seoSection()]`. **Dynamic `targets` injection removed.**
12. **No separate panel/tab API.** Extend field-group `placement: 'main' | 'sidebar' | 'tab'`. The tab strip appears only when a group declares `placement: 'tab'` — zero-cost when unused.
13. **Custom field types are first-class** via `registerFieldType` (renderer + validator + defaultValue + typeGen). Renderers compose from exported core field renderers + UI atoms.
14. **Plugin footprint is derived, never declared** — `ctx.config.entryTypesWithField('seo')` is the single source of truth for "which entry types use this plugin".

### 3.5 Admin nav, pages, URLs

15. Plugin **custom pages** mount under `/admin/plugin/{name}/*` (forced namespace), merged into the TanStack file-based tree via a **single catch-all route** (`_protected/plugin/$.tsx`) resolved at runtime. This closes the Phase 17.5 deferred "verify plugin route merging" item.
16. Plugin-contributed **entry types live flat at `/admin/entries/{type}`** like user entry types — fully first-class, no special-casing. Sidebar grouping is a nav-tree concern, not a URL concern.
17. **`nav` is a tree** (one parent + children); items can point anywhere; a `permission: '<action>'` field auto-hides items the user can't access.
    **Implementation note (18b review):** plugin authors no longer write the nav tree — **pages are the core concept**. Pages appear in the sidebar by default (`nav: false` opts out) and group under the plugin's top-level `label`/`icon` identity (single-child groups auto-flatten in the sidebar). Page `label` is short (`'Overview'`); titles compose plugin + page label ("SEO Overview"). Page `icon` is a top-level page field (sidebar now, page chrome later). A page is a `component` view **or** an auto-rendered `settings` form (`admin.settings` as a separate concept is gone). Page `permission` strings auto-namespace: bare keys → `plugin:<ns>:<key>`, strings containing `:` pass through (core permissions like `settings:read`, which is also the settings-page default — chosen because the settings API enforces core settings permissions, so the page guard stays aligned and new plugins need no role grants; plugin-specific permissions are the explicit-grant path via `suggestedRoleGrants`). `defineAdminPage()` is the typed helper.

### 3.6 Visual consistency & dependencies

18. Public exports: `astromech/ui` (atoms — already added in Phase 6), `astromech/ui/fields` (core field renderers), `astromech/ui/layout` (`PageHeader`/`PageLayout`/`Breadcrumb`/`Toolbar`), core hooks.
19. **Peer deps:** React, TanStack Router/Query, i18next (plugin must not double-bundle). `astromech/*` for everything CMS-owned.
20. **`useAstromechPlugin()`** convenience hook returns runtime context: `sdk`, `toast`, `modal`, `currentUser`, `navigate`, and a **pre-scoped `t`**. Wrap CMS-specific things, **not** React/TanStack.

### 3.7 Database

21. Plugins **can** ship Drizzle tables (escape valve for activity-log/analytics that don't fit entries). The v1 plugins don't strictly need them — "build the road, drive later."
22. Convention: **`plugin_{alias}_*`** table prefix. **No cross-plugin FKs** (soft string refs only).
23. **Single Drizzle migration log.** `astromech db:generate` / `db:migrate` wrap drizzle-kit with plugin schemas merged in. **Per-plugin migration tracking dropped** (over-engineered). Uninstall **leaves tables intact**; an explicit CLI drops them.
24. **Multi-dialect deferred** — plugins are **SQLite-only** for now; revisited in Phase 23 alongside core's own dialect work.
25. **No per-entry-type tables.** (EmDash does this; we keep the single `entries` table for cross-type queries + shared versioning/locales/status/trash.)

### 3.8 Permissions

26. Format **`plugin:<sanitised-package>:<action>`**, anchored to the package (survives alias renames).
27. A plugin declares `permissions: [{ key, label, description }]` → **auto-grouped per-plugin section** in the role editor (Strapi pattern).
28. **Wildcards:** existing `*`, `plugin:<pkg>:*`, plus a **new `plugin:*`** (all plugin perms across all plugins) — needs a small `hasPermission()` extension for the 2-part prefix.
29. Built-in `admin` (`*`) covers all plugins automatically. Plugins declare **advisory** `suggestedRoleGrants` — applied by an admin via a one-click notice, **never automatically**.

### 3.9 Lifecycle / hooks

30. The plugin definition is **almost entirely declarative data** (`permissions / entries / fields / schema / sdk / hooks / hookEvents / cron / admin / i18n / requiredEnv / dependsOn`). **`setup(ctx)` is an optional imperative escape hatch** that runs once per runtime boot.
31. **Hooks declared as a `hooks: { 'event': handler }` object** — one handler per event per plugin (compose internally if you need several). The `hooks.on()` imperative API is **dropped**.
32. **Unified `PluginContext`** across hooks/sdk/cron/api: `{ db, config, user (nullable), sdk, sendEmail, logger, env, emit }`.
33. **Cron** declared as `cron: [{ name, schedule, handler }]`; job names auto-namespaced; mapped onto the existing `registerCronJob()` (Phase 16).
34. **Open hook registry:** plugins declare `hookEvents: [...]` and fire via `ctx.emit(event, payload)`; anything subscribes via `hooks`. Declared events get type-augmented. Hook names become `KnownCoreEvent | string`.

### 3.10 Settings & secrets

35. **Build-time options** → factory args (committed code).
36. **Runtime-editable settings** → the **existing settings table**, namespaced `plugin:<pkg>:<key>`, with an **auto-rendered settings page** from a declared schema (a field group bound to settings keys).
    **Implementation note (18b review):** the schema is declared on a _page_ (an `admin.pages` entry with `settings` instead of `component`) at any path the plugin chooses — any page can be a view or a settings holder. Settings pages default to `permission: 'settings:read'`.
37. **Secrets → env vars only.** Plugin declares `requiredEnv: [...]`, validated at boot, read from the **unified `ctx.env`** (never the settings table, never the browser). `ctx.env` resolves via `import.meta.env` in Vite/Astro SSR (project convention — see memory `feedback_vite_env_vars`).

### 3.11 i18n

38. **Per-plugin i18next namespace** = sanitised package. Locale resources collected via a code-gen virtual module. `useAstromechPlugin().t` is **pre-scoped** to the namespace. Fallback follows core.
    **Implementation note (18b):** declared as **string import specifiers** (`i18n: { en: './locales/en.json' }`), not thunks — thunks can't serialize into the code-gen module; this matches the §11 rule for all browser-bound assets.
39. **Server-side plugin i18n is out for v1** — admin-UI strings only; server strings are English-keyed.

### 3.12 Failure isolation

No sandboxing — the trust model is **vetted npm packages in the developer's own config**.

40. Build/config + `setup()` boot failures → **crash loud**, naming the plugin.
41. **`before*` hooks** → a throw **aborts** the operation (validation gates). **`after*` hooks** → **swallow-and-log** (never roll back committed work).
42. API/SDK throw → **contained per-request**, standard error envelope. Cron throw → **contained per-job**. React component throw → **per-plugin error boundary** with a localized fallback.
43. All contained runtime failures are logged with **plugin attribution**. Admin-UI surfacing of failures is **deferred** to the notifications phase.

### 3.13 Integrations / compositional model

44. **Hybrid model:** Forms ships **built-in** reCAPTCHA + Turnstile (on `forms:beforeSubmit`) and common mailing-list forwarding (on `forms:afterSubmit`), option-toggled. Everything else extends via hooks.
45. **Dogfooding principle:** first-party built-in integrations are implemented **through the plugin's own exposed hooks** — the same surface a third party would use. If a built-in can't be built on the hook, fix the hook.

### 3.14 Inter-plugin dependencies

46. **`dependsOn`** = existence check + basic **semver range** check (the Gravity-Forms-+-Mailchimp-extension model). No auto-install / negotiation. Ordering = `plugins: []` array order; dependencies resolve first.

### 3.15 AI features

47. **Out of Phase 18.** SEO v1 ships **non-AI affordances only** (title/excerpt length recommendations, counters, previews). AI metadata writing is its own future phase (a cross-cutting AI-provider concept: keys, model selection, completion abstraction).

---

## 4. Plugin Definition Shape

A sketch of the resolved shape (exact types finalised during 18a). The factory returns this; nearly all fields are declarative data.

```ts
export function definePlugin<Options>(
    factory: (options: Options) => PluginDefinition
): (options?: Partial<Options>) => PluginDefinition;

export type PluginDefinition = {
    // Identity
    package: string; // canonical, e.g. '@astromech/redirects'
    name?: string; // access key; defaults to last path segment
    alias?: string; // user override for collisions
    // permissionNamespace is always sanitised(package) — derived, not user-set
    label?: string; // admin display name (sidebar group, page-title prefix); defaults to access key
    icon?: string; // Lucide icon for the sidebar group

    // Declarative surfaces
    permissions?: PluginPermission[]; // { key, label, description }
    suggestedRoleGrants?: SuggestedGrant[];
    entries?: Record<string, EntryTypeConfig>;
    fields?: FieldTypeRegistration[]; // registerFieldType payloads
    schema?: DrizzleSchemaModule; // plugin_{alias}_* tables
    sdk?: Record<string, SdkMethod>; // each MUST declare `access`
    rawRoutes?: RawRoute[]; // escape hatch, mounted in /api/plugins/{name}/*
    hooks?: Partial<Record<KnownCoreEvent | string, HookHandler>>;
    hookEvents?: string[]; // events this plugin fires (type-augmented)
    cron?: CronJob[]; // { name, schedule, handler }
    admin?: {
        pages?: PluginPage[]; // mounted under /admin/plugin/{name}/*; nav + settings live on pages
    };
    i18n?: Record<string, () => Promise<unknown>>; // lazy locale thunks
    requiredEnv?: string[];
    dependsOn?: Record<string, string>; // package -> semver range

    // Imperative escape hatch (optional, runs once per boot)
    setup?: (ctx: PluginContext) => void | Promise<void>;
};

export type SdkMethod = {
    access: 'public' | 'authenticated' | { permission: string };
    handler: (input: unknown, ctx: PluginContext) => Promise<unknown>;
};

export type PluginContext = {
    db: Database;
    config: ResolvedConfig & { entryTypesWithField(field: string): string[] };
    user: User | null;
    sdk: AstromechClient;
    sendEmail: (to: string, subject: string, element: ReactElement) => Promise<void>;
    logger: Logger; // attributes log lines to the plugin
    env: Record<string, string | undefined>; // via import.meta.env in SSR
    emit: (event: string, payload: unknown) => Promise<void>;
};
```

**Browser-bound references (components, pages) are declared as string import specifiers** — not inline thunks — so the Node-side generator can statically emit `import(specifier)`. This is a real ergonomic constraint on plugin authors and must be documented in the author guide.

---

## 5. SDK + API Parity

The consistency story: **author writes the logic once** (the `local` handler in the `sdk` object), and three things are derived from it:

1. **Local SDK** — `Astromech.plugins.X.method(input)` calls the handler directly against the DB. Wired by `virtual:astromech/plugins/local`.
2. **HTTP API** — auto-mounted `POST /api/plugins/{name}/{method}`, JSON in/out, `access` enforced against `c.var.user`. Wired by `virtual:astromech/plugins/server`.
3. **Fetch SDK** — `Astromech.plugins.X.method(input)` over HTTP; shim auto-generated to call the matching route. Wired by `virtual:astromech/plugins/fetch`.

`access` enforcement is automatic and uniform:

- `'public'` — no auth required.
- `'authenticated'` — requires a session user.
- `{ permission: 'lookup' }` — requires `plugin:<pkg>:lookup` (or a covering wildcard).

The **raw escape hatch** (`rawRoutes`) is for payloads RPC-JSON can't carry (file uploads, streaming). It mounts inside `/api/plugins/{name}/*` through a thin wrapper over the HTTP layer so the infra stays swappable. It still declares `access`.

---

## 6. Fields & Edit Page

- **Composition, not configuration.** Plugins export field-group factories; the user attaches them in their entry-type `fieldGroups: [...]`. There is no implicit injection.
- **`placement`** on a field group: `'main' | 'sidebar' | 'tab'`. The tab strip on the edit page renders only if at least one group is `placement: 'tab'`.
- **`registerFieldType(reg)`** registers a custom field type with renderer, validator, defaultValue, and typeGen contributions. SEO's `seo-preview` (a presentational search preview that reads sibling values) and Forms' form-builder field are the driving use cases. Renderers compose from `astromech/ui/fields` + `astromech/ui` atoms.
- **Footprint derivation:** anything needing "which entry types use field X" calls `ctx.config.entryTypesWithField('X')`.

---

## 7. Admin Nav, Pages, URLs

- **Pages:** `admin.pages` mount under `/admin/plugin/{name}/*`. A single runtime-resolved catch-all route `src/admin/pages/_protected/plugin/$.tsx` dispatches to the registered plugin page component (declared via string import specifier, lazy-loaded). This is how plugin routes merge into the file-based tree without codegen into `routeTree.gen.ts`.
- **Entry types:** flat at `/admin/entries/{type}`, identical to user types.
- **Nav:** derived from pages — pages appear by default (`nav: false` opts out), using the page's `label`/`icon`, grouped under the plugin's top-level `label`/`icon`. The derived tree still carries per-item `permission` (resolved); the sidebar renderer auto-hides items the current user lacks permission for and auto-flattens single-child groups. Page titles compose plugin + page label ("SEO Overview").
- **Settings pages:** any `admin.pages` entry declaring `settings` (instead of `component`) auto-renders a settings form bound to `plugin:<pkg>:<key>` settings rows, defaulting to `permission: 'settings:read'`.
- **Permissions on pages:** bare keys auto-namespace (`'view'` → `plugin:<ns>:view`); qualified strings pass through — same rule as SDK `access.permission`.

---

## 8. Public Exports

| Export                 | Contents                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `astromech/ui`         | UI atoms (added Phase 6).                                                                                         |
| `astromech/ui/fields`  | Core field renderers (compose custom field types from these).                                                     |
| `astromech/ui/layout`  | `PageHeader`, `PageLayout`, `Breadcrumb`, `Toolbar`.                                                              |
| `astromech/db`         | Drizzle helpers for plugin schema authoring.                                                                      |
| `useAstromechPlugin()` | Runtime context hook: `{ sdk, toast, modal, currentUser, navigate, t }` (`t` pre-scoped to the plugin namespace). |

React / TanStack Router / TanStack Query / i18next are **peer deps** — wrap CMS-specific things only, never re-export the underlying libs.

---

## 9. Database

- Plugin Drizzle schemas use the **`plugin_{alias}_*`** table prefix and **no cross-plugin FKs** (soft string references only).
- `astromech db:generate` / `db:migrate` wrap drizzle-kit with all plugin schemas merged into a **single migration log**. No per-plugin migration tracking.
- Uninstalling a plugin **leaves its tables intact**; a separate explicit CLI command drops them.
- **SQLite-only** for v1 (`sqliteTable`). Multi-dialect lands in Phase 23 with core's dialect work.

---

## 10. Permissions

- Strings: `plugin:<sanitised-package>:<action>`.
- Plugins declare `permissions: [{ key, label, description }]`; the role editor renders an **auto-grouped per-plugin section**.
- Wildcards: `*` (all), `plugin:<pkg>:*` (one plugin), and **new `plugin:*`** (all plugins) — requires a 2-part-prefix extension to `hasPermission()` in `src/core/permissions.ts`.
- `admin` role (`*`) covers everything. `suggestedRoleGrants` are **advisory** — surfaced as a one-click admin notice, applied manually, never automatically.

---

## 11. Build Pipeline

The hard constraint (§1): functions don't survive `JSON.stringify`, so plugin-bearing modules are **code-generating** (emit real `import` statements) rather than data-serializing.

**Implementation note (18a).** The SDK wiring does _not_ use code-gen virtual modules. The locked constraint was "functions die in `JSON.stringify`" — but plugin handlers, hooks, and cron are registered live into a `globalThis` runtime registry at boot (`registerPlugins`, the same pattern cron already uses), so the functions are available in-process without serialization. Consequently:

- **Local SDK** (`Astromech.plugins.X`) builds dynamically from the runtime registry and calls handlers directly (a `Proxy` resolves names/methods lazily). No virtual module.
- **Fetch SDK** synthesises HTTP shims with a `Proxy` (`plugins.<name>.<method>(input)` → `POST /api/plugins/<name>/<method>`). No name list, no codegen.
- **Hooks / cron / RPC routes** are read from the same registry server-side.

Code-gen virtual modules remain the right tool for **browser-bound assets** that the bundler must statically import — plugin React components and lazy locale imports (18b). Those are declared as **string import specifiers** so the Node-side generator can emit `import(specifier)`.

Virtual modules by audience:

| Module                                               | Audience | Method                                                                             |
| ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `virtual:astromech/config`                           | Node/SSR | serialize (existing)                                                               |
| `virtual:astromech/admin-config`                     | browser  | serialize (existing — **extend** with plugin nav/permissions/static metadata)      |
| `virtual:astromech/plugins/components`               | browser  | **code-gen** lazy React imports, keyed `plugin:name` (18b)                         |
| `virtual:astromech/plugins/i18n`                     | browser  | **code-gen** lazy locale imports (18b)                                             |
| ~~`virtual:astromech/plugins/{local,fetch,server}`~~ | —        | **superseded** by the `globalThis` runtime registry + Proxy shims (see note above) |

- Extend the existing `injectTypes('astromech.d.ts')` step (`astro:config:done` → `generateSdkTypes`, `src/core/type-generator.ts`) to emit `declare module` augmentation mapping **access keys → inferred plugin SDK types**, plus declared plugin hook-event types.

---

## 12. Implementation Plan — Three Slices

Dependency-ordered. Each slice ends by shipping one real plugin that stress-tests exactly what it built; validation complexity ascends **redirects → SEO → forms**.

### 18a — Plugin Runtime (headless)

Build the spine:

- [ ] `definePlugin` factory; identity derivation (`package`/`name`/`alias`/`permissionNamespace`); collision → build error.
- [ ] Declarative `PluginDefinition` type; replace the old `AstromechPlugin` (`src/types/plugins.ts`).
- [ ] Rewrite `src/core/plugin-resolver.ts` — **remove** `resolveTargets` / `mergePluginFieldGroups` target injection; keep entry-type merge; add SDK / hook / cron / schema / API collection. Update `src/core/config-resolver.ts` callers.
- [ ] Unified `PluginContext` (`{ db, config, user, sdk, sendEmail, logger, env, emit }`).
- [ ] **Open hook registry** (`src/types/hooks.ts` → open `KnownCoreEvent | string`) + `hooks: {}` declaration + `ctx.emit`.
- [ ] SDK namespace `Astromech.plugins.X` (local + fetch) via code-gen virtual modules.
- [ ] Auto-mounted RPC API at `/api/plugins/{name}/{method}` + `access` enforcement + raw escape hatch wrapper (`src/api/plugins/*`).
- [ ] DB schema merge + `db:generate` / `db:migrate` wrappers + `plugin_{alias}_` prefix.
- [ ] Failure isolation (boot crash-loud; before/after hook semantics; per-request/per-job containment).
- [ ] `dependsOn` existence + semver checks; ordering by `plugins: []`.
- [ ] Non-UI code-gen virtual modules (`local`, `fetch`, `server`).
- [ ] **Ship `@astromech/redirects`** — redirect entry type + slug-change `entry:afterUpdate` auto-redirect hook + `lookup` SDK; near-zero UI. Proves the spine.

### 18b — Plugin Admin UI

- [ ] Field-group `placement: 'tab'`; edit-page tab strip.
- [ ] `registerFieldType` (renderer + validator + defaultValue + typeGen).
- [ ] Plugin nav tree; permission-gated auto-hide.
- [ ] Pages under `/admin/plugin/{name}/*` + catch-all `_protected/plugin/$.tsx` (closes Phase 17.5 deferred item).
- [ ] Per-plugin React error boundaries with localized fallback.
- [ ] Auto-rendered settings page from `admin.settings`.
- [ ] Public exports: `astromech/ui/fields`, `astromech/ui/layout`, `astromech/db`, `useAstromechPlugin()`.
- [ ] Component + i18n code-gen virtual modules; type augmentation in `astromech.d.ts`.
- [ ] **Ship `@astromech/seo`** — composed `seoSection()` (core text/textarea with `count` length hints + a custom `seo-preview` field, data namespaced under the `seo` key) + overview dashboard + settings (default OG image) + sitemap/OG data via SDK + length recommendations (non-AI). Proves the UI surface.

### 18c — Compositional Integrations

- [ ] Form-builder custom field type (may extend repeater/blocks concepts).
- [ ] Public `submit` API + file-upload raw escape hatch.
- [ ] `forms:beforeSubmit` / `forms:afterSubmit` hook events.
- [ ] Built-in reCAPTCHA / Turnstile / Mailchimp **via those hooks** (dogfooding principle).
- [ ] **Ship `@astromech/forms`** — `form` + `submission` entry types, form-builder field, public submission API, frontend form helper/component. Proves the open-hook compositional model.

### 19 — Remaining first-party

Analytics, activity log, backups, comments, import/export — built on the proven foundation.

---

## 13. Reference: Per-Plugin Requirements (design-against)

- **Redirects:** redirect entry type, admin-managed list, `lookup` SDK (local + fetch), slug-change auto-generation via `entry:afterUpdate`, frontend middleware = copy-paste README recipe.
- **SEO:** `seoSection()` field-section factory composing core text/textarea (with `count` length hints) + a custom `seo-preview` search-preview field, data namespaced under the `seo` key; SEO overview dashboard page, sitemap + OG data via SDK (user renders `/sitemap.xml`), settings (default OG image). AI deferred.
- **Forms:** `form` + `submission` entry types, form-builder field type, public `submit` API (+ file upload), `forms:beforeSubmit`/`forms:afterSubmit` events, built-in reCAPTCHA/Turnstile/Mailchimp via those hooks, frontend form helper/component.

---

## 14. Reference: EmDash (diverged from)

EmDash (Cloudflare CMS): DB-first editor-mutable schema, per-collection tables (`ec_*`), sandboxed Dynamic-Worker plugins with capability bindings + namespaced KV, hooks. We diverge on all of these (code-first config, single `entries` table, trusted/non-sandboxed plugins, direct DB via SDK toolkit) because of a different audience — developer CMS vs content-editor/marketplace. **One idea filed for later:** per-plugin namespaced KV for ephemeral state. Sources: `blog.cloudflare.com/emdash-wordpress`, `emdashcmseverything.com/official-docs/concepts/architecture`.

---

## 15. Out of Scope (v1)

- **AI metadata writing** (own future phase; cross-cutting AI-provider concept).
- **Server-side plugin i18n** (admin-UI strings only for v1).
- **Multi-dialect plugin DB** (Postgres/MySQL — Phase 23).
- **Plugin sandboxing / capability model** (trust = vetted npm packages).
- **Per-plugin migration tracking** (single migration log instead).
- **Admin-UI surfacing of contained runtime failures** (deferred to the notifications phase).
- **Auto-install / dependency negotiation** (`dependsOn` is check-only).
- **Per-plugin namespaced KV** (filed from EmDash; not v1).
- **Deep framework integrations** (`@astrojs/sitemap`, `astro-seo`) — README recipes only.

---

## 16. First-party Plugin Code Layout

Standard directory layout for first-party plugins (adopted during 18b review; `seo` and `redirects` conform). The organizing principle is the **browser/server boundary** (§11): admin components load via `@/plugins/<name>/*` string specifiers and may only import `astromech/ui*`; server code runs in `PluginContext` and must never touch React.

```
src/plugins/<name>/
├── README.md              # recipes + integration docs
├── index.ts               # LITERALLY just the plugin definition: the
│                          #   definePlugin call + re-exports of public API
├── shared.ts              # isomorphic types/constants/pure helpers — the only
│                          #   module both sides may import (→ shared/ if it grows);
│                          #   options types + their defaults live here
├── fields/
│   ├── groups.ts          # composition helpers (e.g. seoSection) — when present
│   └── <type>.ts          # field type registrations (e.g. seo-preview.ts)
├── entries.ts             # entry-type configs — when bulky enough to leave index
├── server/
│   ├── sdk.ts             # SDK methods (→ sdk/<method>.ts when big)
│   ├── hooks.ts           # entry hooks
│   ├── cron.ts
│   ├── schema.ts          # Drizzle tables
│   └── routes.ts          # raw Hono routes
├── admin/
│   ├── fields/            # field components, css co-located
│   ├── pages/             # page components, css co-located
│   └── components/        # plugin-internal shared UI
└── locales/
    └── en.json
```

Rules:

- **`index.ts` is the definition and nothing else** — the `definePlugin` call plus re-exports. Implementation lives in `shared.ts` / `server/` / sibling modules.
- **`index.ts` never imports from `admin/`** — keeps the package entry server/config-safe; admin code is reached only via string specifiers (`@/plugins/<name>/admin/fields/*.tsx`).
- **`server/` modules export builders taking resolved options** (`seoSdk(pathForEntry)`) when handlers close over options; plain objects otherwise (`redirectsSdk`).
- **`shared.ts` is pure and dependency-free.** Plugin identity constants (field names, permission namespace) live here.
- Field _definitions_ (`type`, `defaultValue`, `typeGen`) are manifest data in `fields/<type>.ts`; only the _component_ lives in `admin/fields/`.
- Naming mirrors the manifest keys (`sdk`, `admin`, `hooks`) — no `services`/`actions` synonyms.
- Tests co-located (`*.test.ts`). Empty directories omitted — the standard says where things go _when they exist_.
