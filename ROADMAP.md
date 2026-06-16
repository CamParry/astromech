# Astromech Roadmap

A feature-oriented map of the project. **Shipped** features come first, **Planned**
work follows, and stray unchecked tasks live in **Backlog** at the end.

Status: ✅ shipped · 🚧 planned

---

## Shipped

### Core & Architecture ✅

- [x] Project restructure — all admin UI under `src/admin/`; SPA replaces the old `.astro` routes; standardised on Base UI (Radix removed)
- [x] Upgraded to React 19, TipTap 3, Astro 6, ESLint 10, Vitest 4; `tsc --noEmit` clean
- [x] `DatabaseDriver` factory pattern with `libsql` and `d1` drivers
- [x] Removed module-level mutable globals (`serverContext`); `globalThis` singleton pattern for cross-chunk registries
- [x] `src/support/` utilities (`strings`, `bytes`, `dates`); `src/types.ts` split into domain/config/api/hooks/plugins/sdk modules
- [x] Framework-agnostic `src/index.ts` (`defineConfig`/`defineEntryType`/`definePlugin` + types); Astro integration extracted to `src/adapters/astro.ts` (`astromech/astro`)
- [x] Hardening pass: removed `any` types, fixed `useEffect` dependency bugs, populate/`updatePositions` repository bugs, type-generator nested-field bug

### API & SDK ✅

- [x] Hono API (`src/api/`): entries, users, media, settings, entry-types routes; auth + error middleware; Zod validation on all handlers; standardised `{ data }` response shape; configurable `apiRoute`/`adminRoute` (default `/api`)
- [x] `astromech/local` (direct DB) and `astromech/fetch` (HTTP) SDKs covering entries, users, media, settings (renamed from `server`/`client`)
- [x] Collection-specific TypeScript type generation from config; relations via `populate`
- [x] Typed entries API ([`specs/typed-entries-api.md`](specs/typed-entries-api.md)): single options object, required `type`, polymorphic atomic bulk ops, DB-enforced `type`+`id` matching, cross-type `query`
- [x] Consolidated `query()` for entries/users/media — `search`/`where`/`trashed`/`sort`/`page`/`limit`/`populate`/`locale`; `QueryResult<T>` with nullable pagination; Drizzle-style sort with whitelist validation
- [x] `EntryStorage` abstraction with boot-validated capabilities (`statuses`/`slug`/`translatable`/`versioning`/`trash`) and `titleField` ([`specs/unified-architecture.md`](specs/unified-architecture.md))
- [x] CORS (same-origin default, opt-in origins) + secure-headers middleware

### Admin Interface ✅

- [x] SPA foundation: `src/admin/main.tsx`, TanStack Router, catch-all `shell.astro`, `virtual:astromech/admin-config`, i18next setup
- [x] Auth & session: `AuthContext`/`useAuth`, login/forgot/reset/first-run-setup pages, `_protected`/`_auth` `beforeLoad` route guards, React Query-backed session
- [x] Layout: AppShell, Sidebar (brand, config-derived nav, plugin nav, collapsed/drawer states), Topbar (breadcrumb, user menu), `UIContext`
- [x] UI component library (`src/admin/components/ui/`) — Button, Input, Textarea, Select, Checkbox/Toggle, Badge, Modal, Dropdown, Toast, Panel, Table, Toolbar, Tabs, Breadcrumb, Spinner/Skeleton, Empty State, Avatar, Tooltip; design tokens + dark-mode overrides; `astromech/ui` export
- [x] Pages: dashboard; entry list (sortable columns, search, status filter, pagination, row + bulk actions, list/grid toggle); entry create/edit (field groups, `FieldInput` dispatcher, save/publish); users list/edit; media library
- [x] App-defined settings pages ([`specs/userland-admin-pages.md`](specs/userland-admin-pages.md)): `admin.pages` + `defineSettingsPage()`, field-tree form at `/page/{path}`, stored in `settings` table (locale-aware `{path}:{locale}`), sidebar "Pages" group gated `settings:read`/`settings:update`
- [x] React Query hooks layer (`useEntries`/`useMedia`/`useUsers` + mutations, query-key factories); replaced all inline `useQuery`/`useMutation`
- [x] File-based routing migration (`src/admin/pages/`, generated route tree); co-located search params, loaders, and guards
- [x] Definition-driven admin ([`specs/unified-architecture.md`](specs/unified-architecture.md)): `deriveTableDefinition`/`deriveFormDefinition` + cell-kind / field-type registries replace hand-written column loops and the field `switch`
- [x] Polish: locale-aware date formatting, URL-synced list search params, binary light/dark toggle (cookie-driven, zero-flash), raised-surface tokens + ghost icon buttons, full mobile responsiveness (off-canvas sidebar, responsive forms/tables, 44px touch targets)

### Content — Entries, Fields & Blocks ✅

- [x] Field library: Text, URL, Password, Email, Textarea, Number, Boolean, Date, Datetime, Color, Select, Multiselect, Media, Relation, Repeater, Slug, Richtext (TipTap), JSON, Group, Checkbox Group, Radio Group, Range, Link, Key-Value; Accordion/Tab visual containers
- [x] Blocks field — block-picker dropdown, collapsible panels, `@dnd-kit` drag-reorder, per-block controls (disable/duplicate/delete/collapse), type generation
- [x] Repeater ↔ blocks UI parity — repeater gains a drag handle + `@dnd-kit` drag-reorder and collapsible/delete controls matching blocks (single-type vs multi-type the only difference)
- [x] Underscore-namespaced reserved instance keys — stored block/repeater items use `_type`/`_disabled` (collision-safe against user field names; `_disabled` is default-by-absence) and a **persisted** `_id` UUID for stable item identity (better diffs/versioning). Author-facing `BlockDefinition.type` unchanged
- [x] Entries terminology: `defineEntryType`, `AstromechConfig.entries`, singular slugs, `Entry.type`, `/entries/:type` routes, `/admin/entries/:type` URLs
- [x] Entry-schema authoring redesign ([`specs/entry-schema-authoring.md`](specs/entry-schema-authoring.md)): POJO field-settings factories (`text('from', { required: true })`), single recursive `fields` tree with layout containers, `astromech/fields` subpath; flat `fields` shortcut; `defineHook` (event-inferred payloads) + `defineSdkMethod` with plugin self-augmentation
- [x] Abstract entry capabilities + `titleField` with boot validation; titleless / statuses-off types supported

### Media ✅

- [x] `media` table; upload/list/get/delete/update API
- [x] Media library page (grid thumbnails, drag-and-drop dropzone, search, bulk delete) + detail page (preview, alt/title, usage metadata)
- [x] `MediaPicker` modal (searchable grid, single/multiple select), drag-to-reorder in multiple mode

### Roles & Permissions ✅

- [x] `roles` table; roles defined in code via `AstromechConfig.roles` + built-in `admin`/`editor` defaults
- [x] Permission-checking utility (`src/core/permissions.ts`); enforced across all API handlers; role assignment in user create/edit; permission-gated UI; read-only form mode
- [x] Permissions grammar overhaul ([`specs/unified-architecture.md`](specs/unified-architecture.md)): `resource:identifier:action`, segment-wise wildcards, `definePermissionBundles` + `builtInRole()`, secure-by-default plugin data

### Versioning, Publishing & Scheduling ✅

- [x] Versions: `entry_versions` table, `versioning: { maxVersions }` config, `VersionsRepository`, auto-save on content change with change-detection, `versions()`/`restoreVersion()` SDK + routes, version-history admin page with field diff + restore
- [x] Publishing: draft/published/scheduled status, `publishedAt`/`publishAt`, status + scheduling UI, publish/unpublish/schedule SDK + endpoints + bulk actions, extracted `PublishPanel`
- [x] CRON system: `CronJob`/`CronContext`, `registerCronJob()` (globalThis registry, plugin-accessible), `runScheduledJobs`/`handleScheduled` + admin-only HTTP trigger; built-in jobs — scheduled-publish, trash-purge, version trimming

### Internationalisation ✅

- [x] Symmetric locale model ([`specs/symmetric-locale-model.md`](specs/symmetric-locale-model.md)): `locale_group` UUID (no primary translation), `UNIQUE(locale_group, locale)` + `UNIQUE(type, locale, slug)`, per-locale delete/trash with opt-in `cascadeLocales`
- [x] `AstromechConfig.locales`/`defaultLocale`, per-collection `i18n`; `entry.locales` map on all responses; `query()` `locale` option; translations via `duplicate(id, { locale, localeGroup })`
- [x] Admin: locale filter on lists, three-way create modal at non-default locale, `LocaleSwitcher`, delete confirmation with cascade checkbox + incoming-relations preview

### Email ✅

- [x] `EmailDriver`/`EmailMessage` types; SMTP (Nodemailer), Resend, and Console drivers; registry; `email?` config
- [x] React Email migration: components + base layout + password-reset template, `renderEmail()` helper, `ctx.sendEmail`, plugin `emails` template overrides, `astromech/email` export
- [x] Wired into Better Auth `sendResetPassword`

### CLI ✅

- [x] `citty` + `jiti` entry point, config loader, `astromech` bin
- [x] DB: `db:init`, `db:status`, `db:generate` (plugin-schema orchestration + drizzle-kit)
- [x] Users: `users:create` / `users:list` / `users:get` / `users:delete`
- [x] Entries: `entries:list` / `entries:get` / `entries:delete`
- [x] `generate:types`, `seed`

### Plugin System ✅

- [x] Plugin runtime ([`specs/plugin-architecture.md`](specs/plugin-architecture.md)): `definePlugin` factory + identity derivation, declarative `PluginDefinition`, unified `PluginContext`, open hook registry + `ctx.emit`
- [x] SDK namespace `Astromech.plugins.X` (runtime registry + Proxy), auto-mounted RPC API `/api/plugins/{name}/{method}` with access enforcement + raw escape hatch, plugin Drizzle schema collection + prefix guard
- [x] Failure isolation (crash-loud boot, before-aborts/after-swallows, per-request `onError`, per-job try/catch), `dependsOn` semver + ordering checks
- [x] Plugin admin UI: field-group `placement: 'tab'`, `registerFieldType`, permission-gated plugin nav tree, `/admin/plugin/{name}/*` catch-all, per-plugin error boundaries, auto-rendered settings page, public browser exports (`astromech/ui/fields`, `astromech/ui/layout`, `astromech/db`, `useAstromechPlugin()`), component + i18n code-gen + `astromech.d.ts` augmentation
- [x] Namespaced plugin entries ([`specs/unified-architecture.md`](specs/unified-architecture.md)): qualified `{plugin}/{type}` identity, per-namespace entries API + typed SDK, `ctx.entries` scoping, `tableStorage()`, app-owned `db:generate` orchestration
- [x] Shipped **`@astromech/redirects`** — own table, slug-change `entry:afterUpdate` hook, typed `lookup` SDK
- [x] Shipped **`@astromech/seo`** — composed `seoSection()` (core text/textarea with `count` length hints + custom `seo-preview` field, namespaced under the `seo` key), dashboard, settings, sitemap/OG via SDK, non-AI length recommendations

### Search ✅

- [x] Command-palette live search across root entries + plugin entries + users + media — permission-gated, debounced, per-source resilient, top-5 per group; static nav / entry-type / plugin-page shortcuts. Title/name+email/filename `LIKE`, frontend-only (reuses existing `query()` methods, no dedicated endpoint)

### Demo Marketing Site ✅

Dogfoods the public APIs end-to-end — Astromech marketing Astromech. See [`specs/userland-admin-pages.md`](specs/userland-admin-pages.md).

- [x] App-defined **Globals** settings page (translatable): site name, tagline, logo, socials, footer, copyright; menus shipped as 2-level nested repeaters (`mainMenu`/`footerMenu`), read via `settings.get('globals', { locale })`
- [x] Config refactor: `author` + `caseStudy` entry types, blocks-based `page`, archive URLs, custom `rating` field plugin; all 24 field + 4 layout types exercised
- [x] Front-end: Tailwind (utilities only, grayscale), `<Blocks>` dispatcher + catalog (hero, richText, featureGrid, media, cta, testimonial, logoCloud, faq, stats, twoColumn), locale-aware layout/nav/footer, `<Seo>` head with `hreflang` alternates, front-end UI-string dictionary
- [x] Locale-aware routes (`/[...path]`, `/blog`, `/blog/[slug]`, `/blog/category|tag/[slug]`, `/customers`, `/customers/[slug]`); `/sitemap.xml`; redirects middleware (`demo/src/middleware.ts`); SSR via `astromech/local` + `.populate()`
- [x] Realistic seed content (`demo/seed.ts`): pages, ~7 posts, 3 case studies, authors, taxonomy, menus, globals, redirects, FR translations

> The Globals-repeater menus are a stop-gap; the dedicated `@astromech/menus` plugin (settings-page + `tree` field) replaces them — see Planned → Menus, `tree` field & clean settings translation, and [`specs/menus-and-tree-field.md`](specs/menus-and-tree-field.md).

---

## Planned

### Forms Plugin (`@astromech/forms`) 🚧

- [ ] Form-builder custom field type
- [ ] Public `submit` API + file-upload raw escape hatch
- [ ] `forms:beforeSubmit` / `forms:afterSubmit` hook events
- [ ] Built-in reCAPTCHA / Turnstile / Mailchimp via those hooks (dogfooding principle)
- [ ] Ship the plugin: `form` + `submission` entry types, form-builder field, public submission API, frontend form helper/component

### Menus, `tree` field & clean settings translation 🚧

See [`specs/menus-and-tree-field.md`](specs/menus-and-tree-field.md). Three
independently-shippable deliverables, in order.

- [ ] **Settings translation cleanup** (prerequisite) — unify app-page + plugin-page settings on one object-blob-per-page shape (`<base>` + `<base>:<locale>`); extract a shared `saveSettingsPage` (partition + write) both renderers call; bring `PluginSettingsPage` to parity (blob load, locale switcher, `PluginPage.translatable`); migrate per-field plugin-settings consumers (seo, demo rating) off `plugin:<ns>:<field>` reads. Top-level-field granularity
- [ ] **`tree` core field type** — generic recursive nested builder (`repeater` + `_children` axis), drag-to-nest (dnd-kit depth-projection; indent/outdent fallback), `maxDepth`, reserved `_id`/`_disabled`/`_children`, terminating recursive type-gen. No menu/URL semantics
- [ ] **`@astromech/menus` plugin** — developer-declared menu set via `menus({ menus: [{ key, label }] })`; one generated `defineAdminPage` settings page (single `tree` field) + nav child per menu; data in settings (not entries/own-table); `menus.get(key, { locale })` resolves entry refs → URLs via `resolveEntryUrl`, custom-URL/label fallback; replaces the demo Globals-repeater menus

### Unified admin pages 🚧

See [`specs/unified-admin-pages.md`](specs/unified-admin-pages.md). Collapse
`defineSettingsPage` (app) and `defineAdminPage` (plugin) into **one page primitive,
form optional** — host + plugins author with the same `defineAdminPage`, rendered by one
shared `SettingsPageForm`.

- [ ] Unify the type — `AdminPage`/`ResolvedAdminPage` replacing `AppAdminPage` + `PluginPage` + `PluginSettingsSchema`; precompute `baseKey` (bare vs `plugin:<ns>:`) + permission so the renderer is origin-agnostic; XOR-validate `fields`/`component` at resolution
- [ ] Promote `page/$.tsx`'s inner form to a shared `SettingsPageForm` (header save + unsaved indicator + locale switcher); both routes render it; delete `PluginSettingsPage`'s bespoke layout
- [ ] Plugin settings forms move from the flat `PluginSettingsSchema` to the full `EntryFields` tree (gain sections/tabs/sidebar)
- [ ] Host pages gain the custom-`component` escape hatch (extend the plugin-components codegen to scan host `admin.pages`)
- [ ] Remove `defineSettingsPage`; migrate demo Globals page + all plugin pages (`settings:` → `fields:`)
- [ ] **Investigate composition** (future) — one page rendering **both** a managed form and custom widgets (Sanity-style view tabs, or a custom component mounting managed form regions via a `useSettingsForm` hook). XOR ships first; keep the `AdminPage` type open so this is additive

### Additional First-Party Plugins 🚧

- [ ] `@astromech/analytics` — tracking-script management + dashboard page
- [ ] `@astromech/activity-log` — audit log (Drizzle table escape valve)
- [ ] `@astromech/backups`
- [ ] `@astromech/comments`
- [ ] `@astromech/import-export`

### Image Optimisation 🚧

- [ ] Sharp integration (Node.js / Bun runtimes)
- [ ] Cloudflare Images or Workers-compatible alternative
- [ ] Generate responsive variants (configurable sizes)
- [ ] Store variants in media record

### Multi-Runtime & Framework Adapters 🚧

- [ ] Document the adapter contract (`RuntimeAdapter`, `FrameworkAdapter` types) in `src/types/`
- [ ] Runtime auto-detection utility (`src/core/runtime.ts`) — Cloudflare Workers, Node, Bun, Deno
- [ ] `astromech/node` — standalone Node/Bun HTTP adapter
- [ ] `astromech/sveltekit` — SvelteKit framework adapter
- [ ] `astromech/nextjs` — Next.js framework adapter

### Storage Drivers 🚧

- [ ] `src/storage/drivers/s3.ts` — S3-compatible driver (`@aws-sdk/client-s3`)
- [ ] `src/storage/drivers/r2-binding.ts` — Cloudflare Workers native R2 binding driver
- [ ] Update `StorageDriver` type + `AstromechConfig` storage config for new driver options
- [ ] Wire R2 binding from the Workers `env` object in the Cloudflare adapter

### Additional Database Drivers 🚧

- [ ] `src/db/drivers/postgres.ts` — Postgres driver
- [ ] `src/db/drivers/mysql.ts` — MySQL driver
- [ ] Drizzle schema variants for Postgres/MySQL column types
- [ ] Migration pipeline per dialect
- [ ] Update `AstromechConfig` DB config type for each dialect
- [ ] Test coverage for each new driver

### Notifications System 🚧

**DB & Core**

- [ ] `notificationsTable` in `src/db/schema.ts` — `id`, `type`, `title`, `message`, `userId`, `readBy`, `createdAt`, `expiresAt`
- [ ] `src/db/repositories/notifications.ts` — `create()`, `list()`, `markRead()`, `markAllRead()`, `deleteExpired()`
- [ ] Built-in CRON job to purge expired notifications

**Service**

- [ ] `src/notifications/index.ts` — `notify(notification)` helper
- [ ] Anti-spam: rate-limit per `source`, duplicate suppression within a window
- [ ] Wire built-ins: scheduled entry published, version restored, trash auto-purged, CRON job errors

**API & SDK**

- [ ] `GET /notifications` (supports `?unread=true`), `POST /notifications/:id/read`, `POST /notifications/read-all`
- [ ] `notifications` namespace on local + fetch SDK: `list()`, `markRead()`, `markAllRead()`
- [ ] Plugin context exposes `notify()`

**Admin UI**

- [ ] Poll unread every 30s from topbar; bell icon badge with unread count; dropdown panel with mark-all-read

### Full-Text Search Indexing 🚧

- [ ] Add `search_index` text column to `entriesTable`
- [ ] `searchable?: false` per field in `FieldConfig` to exclude fields from the index
- [ ] Rebuild index on entry save; `astromech entries:reindex` CLI command for backfilling
- [ ] Switch search to query the `search_index` column

### Populate & Complex Field Data Model 🚧

**Media populate**

- [ ] Single-traversal `populate` pass for media IDs in fields JSON: extract all IDs, fetch in one `WHERE id IN (...)`, reinsert hydrated objects
- [ ] Handle media IDs inside repeater rows, block items, and group fields in the same pass
- [ ] Extend SDK `populate` to include `'media'` alongside relations

**Relationship keys in repeaters & blocks**

- [x] Decide UUID-keyed objects vs arrays for repeater/block item storage — arrays of objects, each carrying a persisted `_id` UUID
- [x] Drag-reorder preserves item identity — reorder keeps the persisted `_id` (no key regeneration); ordering is array position, not a separate `_order` field
- [ ] Stable `_id`-based paths for nested-field relationship keys (foundation now in place via persisted `_id`)
- [ ] Migration strategy for pre-existing stored data (demo currently reseeds; no general migration framework yet)

### Content visibility — public vs full reads, field privacy, audience filtering ✅

Generalised the disabled-item problem into one model — see [`specs/content-visibility.md`](specs/content-visibility.md). Two orthogonal axes, both derived from the current user + role: **shape** (`public` vs `full`, binary, role-gates `full`) and **audience** (row filter — status now, member audiences later). Field default is public; mutations always private; settings private by default with per-key public opt-in.

- [x] Public-vs-full read shapes — bare `astromech/local` defaults `public`; `ctx.entries`/admin default `full`; HTTP `full` capability-gated (`entry:read:full`)
- [x] Recursive runtime filter (`src/core/visibility.ts`) — strips `_disabled` items + `_title`/`_disabled` keys, private fields, and draft/scheduled rows on public reads; composes through populate
- [x] Two derived types from one schema (`${Pascal}Fields` / `${Pascal}FieldsPublic`) + read-back guard (public-shape value can't be written back)
- [x] Settings private by default; `public` opt-in per admin page / `config.publicSettings`
- [ ] Demo cleanup: drop the now-redundant manual `!b._disabled` filter in demo `<Blocks>` and browser-verify public vs admin renders (Step 7 — not yet done)
- [ ] Future: member audiences (frontend auth), per-field audience, `preview` shape — seams built, see spec §9

---

## Backlog

Loose tasks pulled from otherwise-shipped features.

- [ ] Remove the obsolete `src/admin/pages/_protected/settings/index.tsx` "Coming soon" placeholder + its sidebar footer link
- [ ] `db:migrate` CLI wrapper (drizzle-kit migrate) — `db:generate` already ships; deferred until a table-shipping first-party plugin needs it
- [ ] Dedicated `GET /search` endpoint + `search()` SDK method — only if a public/programmatic search surface is needed
- [ ] `searchable?: false` opt-out on `EntryTypeConfig` — add when a titled root type should be excluded from search
- [ ] Browser-verify the demo marketing site on port 4323
- [ ] Investigate version history for settings (app-pages + plugin settings pages currently KV-upsert, no revisions) — relevant if settings-backed features (e.g. menus) want revert/history the way entries get it
