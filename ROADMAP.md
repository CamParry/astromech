# Astromech Roadmap

## Phase 1 — Restructure & Foundation ✅

- [x] Move all admin UI source into `src/admin/`
    - [x] `src/components/` → `src/admin/components/`
    - [x] `src/assets/styles/` → `src/admin/styles/`
    - [x] `src/routes/*.astro` → deleted (replaced by SPA)
    - [x] `src/routes/users/` → deleted
    - [x] `src/routes/collections/` → deleted
    - [x] `src/routes/media/` → deleted
- [x] Create `src/api/` placeholder structure for Hono route handlers
- [x] Update all internal imports to reflect new paths
- [x] Clean up stale `.astro` route exports from `package.json`
- [x] Remove `@radix-ui/*` packages (standardised on Base UI)
- [x] Upgrade all packages to latest stable (React 19, TipTap 3, Astro 6, ESLint 10, Vitest 4)
- [x] TypeScript passes clean (`tsc --noEmit`)

---

## Phase 2 — API Layer (Hono) ✅

- [x] Install Hono (`hono`)
- [x] Create `src/api/index.ts` — root Hono app
- [x] Create `src/api/routes/entries.ts` — entries CRUD
- [x] Create `src/api/routes/users.ts` — users CRUD
- [x] Create `src/api/routes/media.ts` — media upload/list/delete
- [x] Create `src/api/routes/settings.ts` — settings read/write
- [x] Create `src/api/routes/collections.ts` — collection metadata endpoint
- [x] Create `src/api/middleware/auth.ts` — Hono middleware to validate session
- [x] Create `src/api/middleware/errors.ts` — consistent error response format
- [x] Update `src/routes/api.ts` to delegate to `app.fetch(request)` only
- [x] Ensure all existing entry operations (filter, sort, paginate, trash, duplicate, slug) are exposed

---

## Phase 3 — SPA Infrastructure ✅

- [x] Install dependencies: `@tanstack/react-router`, `@tanstack/react-query`, `i18next`, `react-i18next`
- [x] Create `src/admin/main.tsx` — SPA entry point (mounts React into `#root`)
- [x] Create `src/admin/router.tsx` — TanStack Router root config (basepath = adminRoute)
- [x] Create `src/admin/shell.astro` — catch-all Astro page, renders bare `<div id="root">` + SPA script
- [x] Update `src/core/route-registration.ts` to register the shell page at `${adminRoute}/[...path]`
- [x] Add `virtual:astromech/admin-config` Vite plugin — safe client-side subset of resolved config
- [x] Set up `src/admin/i18n.ts` — i18next initialisation
- [x] Create `src/admin/locales/en.json` — English strings

---

## Phase 4 — Auth & Session ✅

- [x] Create `src/admin/context/auth.tsx` — `AuthContext`, `useAuth()` hook
    - [x] On mount: fetch `/api/cms/auth/session` to get current user
    - [x] Exposes: `user`, `isLoading`, `login()`, `logout()`
- [x] Create auth route group in TanStack Router (public — no session required)
- [x] Create `src/admin/pages/auth/login.tsx` — login form (email + password via Better Auth client)
- [x] Create `src/admin/pages/auth/forgot-password.tsx`
- [x] Create `src/admin/pages/auth/reset-password.tsx` (reads token from URL)
- [x] Create `src/admin/pages/auth/setup.tsx` — first-run setup wizard (create initial admin user)
    - [x] Check on mount if setup is needed via API endpoint
- [x] Add route guard: redirect unauthenticated users to `/admin/login`
- [x] Add route guard: redirect authenticated users away from auth pages
- [x] Remove old `src/middleware.ts` admin redirect logic (replaced by SPA auth guards)
- [x] Update Astro middleware to only handle: session loading + locals population

---

## Phase 5 — Core Layout & Navigation ✅

- [x] Create `src/admin/components/layout/AppShell.tsx` — root layout (sidebar + main area)
- [x] Create `src/admin/components/layout/Sidebar.tsx`
    - [x] Logo / brand area
    - [x] Primary navigation (collections, media, users, settings)
    - [x] Secondary navigation (plugin-contributed items)
    - [x] Collapsed state (CSS-driven, state in Context)
- [x] Create `src/admin/components/layout/Topbar.tsx`
    - [x] Page breadcrumb / title area
    - [x] User menu (profile, logout)
- [x] Create `src/admin/context/ui.tsx` — `UIContext` for sidebar state, active nav item
- [x] Navigation items derived from resolved config (collections list, plugin nav items)
- [x] Active route highlighting via TanStack Router `useMatch`

---

## Phase 6 — UI Component Library ✅

- [x] Audit existing components and extract into `src/admin/components/ui/`
- [x] **Button** — variants: primary, secondary, ghost, danger; sizes: sm, md, lg
- [x] **Input** — text, email, password, search; error/disabled states
- [x] **Textarea**
- [x] **Select** (Base UI) — single and multi
- [x] **Checkbox** / **Toggle**
- [x] **Badge** — status colours (draft, published, scheduled)
- [x] **Modal / Dialog** (Base UI) — confirm, form modal
- [x] **Dropdown / Menu** (Base UI) — action menus, user menu
- [x] **Toast / Notification** — success, error, info; auto-dismiss
- [x] **Panel / Card** — container with optional header/footer
- [x] **Table** — sortable columns, row selection, pagination controls
- [x] **Toolbar** — search input + filter row above tables
- [x] **Tabs** (Base UI)
- [x] **Breadcrumb**
- [x] **Spinner / Skeleton** — loading states
- [x] **Empty State** — no items placeholder
- [x] **Avatar**
- [x] **Tooltip** (Base UI)
- [x] Define all design tokens in `src/admin/styles/partials/theme.css`
- [x] Ensure `[data-theme="dark"]` overrides work for all tokens
- [x] Add `astromech/ui` export entry in `package.json` + `tsup.config.ts`

---

## Phase 7 — Admin Pages ✅

### Dashboard

- [x] `src/admin/pages/dashboard.tsx`
- [x] Summary cards (total entries per collection, recent activity)

### Entries

- [x] `src/admin/pages/collections/index.tsx` — entry list
    - [x] Table with sortable columns (from collection `columns` config)
    - [x] Search input
    - [x] Status filter (draft / published / scheduled / trash)
    - [x] Pagination
    - [x] Row actions: edit, duplicate, delete, trash/restore
    - [x] Bulk actions (delete, publish, trash)
    - [x] List/grid view toggle (persisted to localStorage)
- [x] `src/admin/pages/collections/create.tsx` — create entry form
- [x] `src/admin/pages/collections/edit.tsx` — edit entry form
    - [x] Field groups rendered in `main` column and `sidebar` column
    - [x] All field types rendered via `FieldInput` dispatcher
    - [x] Save (draft) + Publish actions
    - [x] Breadcrumb back to list

### Users

- [x] `src/admin/pages/users/index.tsx` — users list
- [x] `src/admin/pages/users/edit.tsx`
    - [x] Basic fields (name, email)
    - [x] Metadata sidebar (created, last updated)
    - [x] Reset password action

### Settings

- [x] `src/admin/pages/settings/index.tsx` — placeholder
    - [ ] General settings (site name, etc.)
    - [ ] Extensible sections (plugins can contribute settings panels)

---

## Phase 8 — Fields ✅

- [x] Text, URL, Password, Email, Textarea, Number, Boolean, Date, Datetime, Color
- [x] Select, Multiselect, Media, Relation, Repeater, Slug, Richtext (TipTap)
- [x] JSON, Group, Checkbox Group, Radio Group, Range, Link, Key-Value
- [x] Accordion (visual), Tab (visual)
- [x] Media field (multiple mode) — up/down reorder + `accept` option

---

## Phase 9 — Media Library ✅

- [x] Complete DB schema: `media` table in `src/db/schema.ts`
- [x] Implement `src/api/routes/media.ts` — upload, list, get, delete, update
- [x] `src/admin/pages/media/index.tsx` — media library page
    - [x] Grid view (thumbnails)
    - [x] Upload dropzone (drag & drop + click)
    - [x] Search input
    - [x] Select for bulk delete
- [x] `src/admin/pages/media/edit.tsx` — media item detail
    - [x] File preview
    - [x] Edit alt text, title
    - [x] Usage metadata
- [x] `MediaPicker` modal in `media-field.tsx` — searchable grid, single/multiple select
- [x] Drag-to-reorder in multiple mode

---

## Phase 10 — SDK & Type Generation ✅

- [x] `src/sdk/server/index.ts` — collections, users, media complete
- [x] `src/sdk/client/index.ts` — mirrors server SDK for collections, users, media
- [x] `astromech/server` and `astromech/client` exports in `package.json`
- [x] Complete settings API implementation (both server & client)
- [x] Generate collection-specific TypeScript types from config
- [x] SDK handles relations: `populate` option returns typed related entries

---

## Phase 10.1 — SDK Rename + Security Hardening ✅

### SDK Rename

- [x] `astromech/server` → `astromech/local` — direct DB access, same codebase only
- [x] `astromech/client` → `astromech/fetch` — HTTP-based, works in browser or any environment
- [x] Update `package.json` exports map
- [x] Update `tsup.config.ts` entry points
- [x] Rename `src/sdk/server/` → `src/sdk/local/` and `src/sdk/client/` → `src/sdk/fetch/`
- [x] Update all internal imports across the codebase
- [x] Typed `EntriesApi` overloads — `Astromech.entries.all({ type: 'post' })` returns `TypedEntry<PostFields>[]`
- [x] Rename `CollectionApi` → `EntryTypeApi`, `AstromechCollections` → `AstromechEntryTypes` throughout

### CORS & Security Headers

- [x] `AstromechConfig.cors?: { origins: string[] }` — opt-in additional origins; default same-origin only
- [x] `AstromechConfig.security?: { headers?: {...} }` — escape hatch for header overrides
- [x] `hono/cors` middleware — same-origin default, reflects configured origins
- [x] `hono/secure-headers` middleware — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`

---

## Phase 10.5 — Architecture Improvements ✅

- [x] Fix `any` types across codebase
- [x] Uncomment `roles` and `entry_versions` tables in DB schema
- [x] Uncomment performance indexes on entries table
- [x] API layer: Zod validation on all route handlers
- [x] Standardise list response shape (`{ data: T[] }`)
- [x] Refactor collection pages to use TanStack Form
- [x] Fix `useEffect` dependency bugs

---

## Phase 10.6 — Core Architecture Refactor ✅

- [x] Replace `DatabaseAdapter` with proper `DatabaseDriver` factory pattern
- [x] Create `src/db/drivers/libsql.ts` and `src/db/drivers/d1.ts`
- [x] Remove module-level `serverContext` mutable global
- [x] Wrap all single-item GET responses in `{ data: T }`
- [x] Audit and move all direct `fetch()` calls in admin into client SDK
- [x] Create `src/support/` — `strings.ts`, `bytes.ts`, `dates.ts`
- [x] Split `src/types.ts` into domain/config/api/hooks/plugins/sdk modules
- [x] Fix `updatePositions()` bug in relationships repository
- [x] Fix populate orphaned data bug
- [x] Fix type generator dropping nested fields

---

## Phase 11 — Email System ✅

- [x] Define `EmailDriver` / `EmailMessage` types (`src/types/config.ts`)
- [x] Implement `SmtpDriver` (Nodemailer, dynamic import, Node.js only)
- [x] Implement `ResendDriver` (native fetch, works in Workers)
- [x] Implement `ConsoleDriver` (dev/logging)
- [x] Create base email layout template (`src/email/templates/base.ts`)
- [x] Create password reset email template (`src/email/templates/password-reset.ts`)
- [x] Wire into Better Auth `sendResetPassword` callback (`src/auth/index.ts`)
- [x] Add `email?` config to `AstromechConfig`
- [x] Email driver registry (`src/email/registry.ts`)

---

## Phase 11.5 — React Email Migration ✅

- [x] Install `@react-email/components` and `@react-email/render`
- [x] Create `src/email/components/` — React Email components
- [x] Rewrite `src/email/templates/base.ts` as a React Email base layout component
- [x] Rewrite `src/email/templates/password-reset.ts` as a React Email component
- [x] Create `src/email/render.ts` — `renderEmail(element): Promise<{ html: string; text: string }>` helper
- [x] Update all internal `send()` call sites to use `renderEmail()` before passing to driver
- [x] Add `sendEmail(to, subject, element)` utility to `AstromechContext`
- [x] Add `emails?: EmailTemplateOverride[]` to `AstromechPlugin` — lets plugins replace built-in templates
- [x] Update plugin resolver to collect and apply email template overrides
- [x] Export `renderEmail` and base email components from `astromech/email`

---

## Phase 12 — Roles & Permissions ✅

- [x] Uncomment / implement `roles` table in DB schema
- [x] Roles defined in code via `AstromechConfig.roles` + built-in defaults (admin, editor)
- [x] Permission checking utility in `src/core/permissions.ts`
- [x] Enforce permissions in all API handlers (entries, users, media, settings)
- [x] Add role assignment to user create/edit
- [x] Conditionally show/hide admin UI elements based on current user permissions
- [x] Read-only form mode for users with entry:read but not entry:update

---

## Phase 13 — Versions ✅

- [x] Uncomment / implement `entry_versions` table in DB schema
- [x] Add `slug` and `relations` columns to `entryVersionsTable`
- [x] `CollectionConfig.versioning` extended to support `{ maxVersions?: number }` config object
- [x] `src/db/repositories/versions.ts` — `VersionsRepository` (list, create, get, getLatestNumber, deleteExcess)
- [x] Auto-save version on entry update when content changes (title, slug, fields, or relations differ)
- [x] Change detection — no version created if nothing changed
- [x] `versions(id)` and `restoreVersion(id, versionId)` — server + client SDK
- [x] Restore: snapshots current state first, then applies historical version + rebuilds relationship rows
- [x] `GET /collections/:collection/:id/versions` and `POST .../versions/:versionId/restore` routes
- [x] Entry edit page: "N revisions" link in publish panel sidebar (only when versioning enabled)
- [x] `src/admin/pages/collections/versions.tsx` — version history page (list + field diff + restore)
- [x] CRON-based version trimming using `maxVersions` config (moved to Phase 16)

---

## Phase 14 — Publishing & Scheduling ✅

- [x] Entry status field (draft / published / scheduled) in DB schema
- [x] Status UI in create/edit pages
- [x] Publish/unpublish bulk actions
- [x] `publishedAt` column in entries schema
- [x] Scheduling UI — date/time picker for `publishAt` (conditional on status = scheduled)
- [x] Dedicated publish / unpublish / schedule API endpoints (`POST .../publish`, `.../unpublish`, `.../schedule`)
- [x] CRON job to transition `scheduled → published` at `publishAt` time
- [x] `PublishPanel` component — extracted sidebar panel used in create/edit pages
- [x] SDK: `publish(id)`, `unpublish(id)`, `schedule(id, publishAt)` — server + client

---

## Phase 15 — Translations ✅

- [x] Add `translationOf` column to `entriesTable` (nullable, with index)
- [x] `CollectionConfig.i18n?: boolean` — opt-in per collection; off by default
- [x] `AstromechConfig.locales?: string[]` and `defaultLocale?: string`
- [x] `AdminConfig` updated with `locales`, `defaultLocale`, and per-collection `i18n`
- [x] Virtual admin-config module exposes `locales`, `defaultLocale`, and `i18n` flag
- [x] `all()` / `paginate()` default to `defaultLocale` for i18n collections; accept `locale` option
- [x] `createTranslation(sourceId, locale, options?)` — creates translation entry, copies fields + relationships
- [x] `getTranslation(sourceId, locale)` — fetches translation entry for a specific locale
- [x] `translations(id)` — returns `TranslationInfo[]` for all locale variants
- [x] Non-translatable fields (`translatable: false`) propagated to all sibling locales on save
- [x] `GET/POST /collections/:collection/:id/translations` and `GET .../translations/:locale` routes
- [x] `src/admin/components/translations/LocaleSwitcher.tsx` — locale switcher with create-translation flow
- [x] Entry edit page: locale switcher in sidebar, locale badge in header, "View source" link
- [x] Entry list: translation count badge per row when `translatable` enabled
- [x] Translation cascade on trash/restore/delete:
    - [x] `trash(id)` — also trash all entries where `translationOf = id`
    - [x] `restore(id)` — also restore all entries where `translationOf = id`
    - [x] `delete(id)` — also delete all entries where `translationOf = id`
    - [x] Add `ON DELETE CASCADE` to `translationOf` column as DB-level safety net

---

## Phase 15.5 — Symmetric Locale Model ✅

Implementation of [`specs/symmetric-locale-model.md`](specs/symmetric-locale-model.md). The "primary translation" concept was eliminated entirely — every locale row is a sibling, linked via a synthetic `locale_group` UUID.

- [x] Replace `translationOf` FK with `locale_group` UUID column — all locales are siblings, no primary (migration `0005_locale_group`)
- [x] `UNIQUE(locale_group, locale)` and `UNIQUE(type, locale, slug)` constraints
- [x] Per-locale `delete` / `trash` by default, opt-in `cascadeLocales: true`; `restore` per-locale only
- [x] Cascade-delete relationships via new `RelationshipsRepository.deleteByEntry/User/Media` helpers
- [x] `entry.locales: { [code]: id }` map populated on all entry responses via batched lookup
- [x] Unified `create({ ..., localeGroup? })` and `duplicate(id, overrides?)` — `createTranslation` / `translations` / `getTranslation` SDK methods removed
- [x] Admin list: locale filter dropdown (default `defaultLocale`), "All locales" option, translations indicator column
- [x] Admin create flow: three-way modal at non-default locale (Translate / Start blank in group / New standalone)
- [x] Admin edit: `LocaleSwitcher` reads `entry.locales` directly; "Create translation" CTA wires to `duplicate(sourceId, { locale, localeGroup })`
- [x] Delete confirmation modal with `cascadeLocales` checkbox and incoming-relations preview (new `Astromech.entries.incomingRelations(id)` SDK method)
- [x] No SDK-level locale fallback — missing locales return null/empty; redirects deferred to Phase 19

Deferred from spec:

- "Link to existing translation group" rescue action on the edit page (out of scope for v1)
- SDK integration test harness (vitest doesn't currently resolve the `virtual:astromech/config` module; manual verification via the seed covers the §15 checklist)

---

## Phase 16 — CRON System ✅

- [x] Define CRON job interface (`CronJob`, `CronContext`) in `src/cron/registry.ts`
- [x] Register CRON jobs via `registerCronJob()` — globalThis registry pattern, plugins can call it from `setup()`
- [x] `runScheduledJobs()` runner — executes all registered jobs, exported as `handleScheduled`
- [x] HTTP trigger: `POST /api/cms/cron/run` (admin-only) for non-Cloudflare runtimes
- [x] Built-in CRON: scheduled publishing transition (`src/cron/jobs/scheduled-publish.ts`)
- [x] Built-in CRON: trash auto-purge (`src/cron/jobs/trash-purge.ts`)
- [x] CRON-based version trimming using `maxVersions` config

---

## Phase 16.5 — Config Separation & Framework Adapters ✅

- [x] Extract Astro integration from `src/index.ts` into `src/adapters/astro.ts`
- [x] `src/index.ts` becomes framework-agnostic: exports `defineConfig`, `defineEntryType`, `definePlugin`, types only
- [x] Add `astromech/astro` export pointing to `src/adapters/astro.ts`
- [x] Update `package.json` exports map
- [x] Update `tsup.config.ts` — add `src/adapters/astro.ts` as entry point
- [x] Create `demo/astromech.config.ts` — demo config extracted from `demo/astro.config.mjs`
- [x] Update `demo/astro.config.mjs` — import config from `astromech.config.ts`, use `astromech/astro`

---

## Phase 16.6 — Entries Rename & SDK Redesign ✅

- [x] `CollectionConfig` → `EntryTypeConfig`, `defineCollection` → `defineEntryType`
- [x] `AstromechConfig.collections` → `.entries`; config slugs go singular (`post`, `page`)
- [x] `Entry.collection` → `Entry.type`; DB column `collection` → `type` (migration `0003`)
- [x] SDK: `Astromech.collections['posts'].all()` → `Astromech.entries.all({ type: 'post' })`
- [x] API routes: `/collections/:collection/...` → `/entries/:type/...`
- [x] Collection metadata route: `/collections-meta` → `/entry-types`
- [x] Admin URLs: `/admin/collections/:collection` → `/admin/entries/:type`
- [x] Sidebar: "Collections" group heading removed; entry types are direct top-level nav items
- [x] Permissions: `entry:read:posts` → `entry:read:post` (singular slugs)

---

## Phase 16.7 — Typed Entries API ✅

Implementation of [`specs/typed-entries-api.md`](specs/typed-entries-api.md). Consolidated the post-locale SDK surface: type is required on every method, bulk operations are atomic, and the `/by-id` workaround is gone.

- [x] Every `Astromech.entries.*` method takes a single options object (`{ type, id, data, ... }`)
- [x] `type` required on every call (TS error if omitted); `query` accepts `type: T | readonly T[]`
- [x] Polymorphic bulk: `update`, `trash`, `delete`, `restore`, `publish`, `unpublish`, `schedule` accept `id: string | string[]` — single id → single return, array id → array return
- [x] Bulk operations wrapped in a DB transaction (all-or-nothing); failure throws `BulkOperationError` with `failedId` + `succeededBefore`
- [x] DB-enforced `WHERE id = ? AND type = ?` on every single-entry op; mismatched type→id throws `EntryTypeMismatchError`, `get` returns `null`
- [x] Bulk-route HTTP surface: `POST /entries/:type/bulk-{trash,delete,restore,publish,unpublish,schedule,update}`
- [x] Cross-type list: `POST /entries/query` registered before any `/:type/...` route
- [x] Deleted `GET /entries/by-id/:id` and the fetch-SDK `resolveEntryType()` workaround (no more pre-flight type lookups)
- [x] Dropped `TypedEntriesProxy` / `TypedEntryTypeApi` / `EntryTypeApi` dead types
- [x] Trash is idempotent; re-trashing an already-trashed entry is a no-op

---

## Phase 17 — CLI ✅

### Setup

- [x] Install `citty` and `jiti`
- [x] `src/cli/index.ts` — CLI entry point, registers all commands
- [x] `src/cli/config.ts` — loads `astromech.config.ts` using jiti, resolves config, initialises DB
- [x] Register `"astromech": "./dist/cli/index.js"` in `package.json#bin`
- [x] Add `src/cli/index.ts` as tsup entry

### DB commands

- [x] `astromech db:init` — run Drizzle migrations; checks DB is empty first; `--force` skips check
- [x] `astromech db:status` — show which migrations have been applied

### User commands

- [x] `astromech users:create` — interactive prompts (name, email, password, role)
- [x] `astromech users:list` — list all users (table output)
- [x] `astromech users:get <id>` — get a single user by ID
- [x] `astromech users:delete <id>` — delete a user; `--force` skips confirmation

### Entry commands

- [x] `astromech entries:list <type>` — list entries; `--status`, `--limit` flags
- [x] `astromech entries:get <type> <id>` — get a single entry (JSON output)
- [x] `astromech entries:delete <type> <id>` — delete entry; `--force` skips confirmation

### Generate / Seed

- [x] `astromech generate:types` — regenerate SDK types from config
- [x] `astromech seed` — run `seed.ts` at project root if present

---

## Phase 17.4 — Admin React Query Hooks ✅

- [x] Define query key factories per resource (`entriesKeys`, `mediaKeys`, `usersKeys`) in `src/admin/hooks/query-keys.ts`
- [x] `src/admin/hooks/entries.ts` — `useEntries()`, `useEntry()`, `useCreateEntry()`, `useUpdateEntry()`, `useDeleteEntry()`, `usePublishEntry()`, etc.
- [x] `src/admin/hooks/media.ts` — `useMedia()`, `useUploadMedia()`, `useDeleteMedia()`, etc.
- [x] `src/admin/hooks/users.ts` — `useUsers()`, `useUser()`, `useUpdateUser()`, etc.
- [x] Replace all inline `useQuery` / `useMutation` calls in admin pages with the new hooks

Hooks stay internal to the admin SPA — no `astromech/react` public export. Consuming apps that want React Query integration can re-implement the thin SDK wrappers in user land with their own query keys, toast system, and invalidation policy.

---

## Phase 17.5 — TanStack Router File-Based Routing ✅

- [x] Install `@tanstack/router-plugin` and wire into Astro's Vite config (`vite.plugins`)
- [x] Configure `routesDirectory: 'src/admin/pages'` and `generatedRouteTree: 'src/admin/routeTree.gen.ts'`
- [x] Add `src/admin/routeTree.gen.ts` to `.gitignore`
- [x] Rename page files to TanStack Router file conventions (`_layout.tsx`, `$param.tsx`, `index.tsx`, etc.)
- [x] Delete manual route definitions from `src/admin/router.tsx`; import generated route tree instead
- [x] Migrate per-route search params, loaders, and `beforeLoad` guards to co-located route files
    - Router context wires `queryClient` so `beforeLoad`/`loader` can call `ensureQueryData`
    - Auth: `AuthProvider` session backed by React Query (`sessionQueryOptions`); `_protected` and `_auth` `beforeLoad` guards replace render-time `<Navigate />` checks; both routes have `pendingComponent` for the auth-check loading state
    - `validateSearch` added to `_auth/reset-password.tsx` and `_protected/media/index.tsx` (replaces the custom `useQueryState` hook, now deleted)
    - Loaders pre-fetch on `entries/$type/$id` (entry), `entries/$type/$id/versions` (entry + versions), `media/$id`, `users/$id` — shared `queryOptions` factories exported from each hooks module
    - All `useParams({ strict: false })` / `useSearch({ strict: false })` casts replaced with `Route.useParams()` / `Route.useSearch()`
- [x] Verify plugin route merging still works (deferred to Phase 18) — closed by the 18b `/plugin/$` catch-all

---

## Phase 18 — Plugin Architecture (Future)

Architecture fully designed and locked — see [`specs/plugin-architecture.md`](specs/plugin-architecture.md) for the complete spec (terminology, locked decisions, build pipeline). Three dependency-ordered slices; each ships one real plugin that stress-tests exactly what it built (validation complexity ascends: redirects → SEO → forms).

### 18a — Plugin Runtime (headless)

- [x] `definePlugin` **factory** `(options) => PluginDefinition`; identity derivation (`package`/`name`/`alias`/`permissionNamespace`); collision → build error
- [x] Declarative `PluginDefinition` type; replace old `AstromechPlugin` (`src/types/plugins.ts`)
- [x] Rewrite `src/core/plugin-resolver.ts` — remove `targets` injection (`resolveTargets`/`mergePluginFieldGroups`); add SDK/hook/cron/schema/API collection; update `src/core/config-resolver.ts`
- [x] Unified `PluginContext` (`{ db, config, user, sdk, sendEmail, logger, env, emit }`)
- [x] Open hook registry (`src/types/hooks.ts` → `KnownCoreEvent | string`) + `hooks: {}` declaration + `ctx.emit`
- [x] SDK namespace `Astromech.plugins.X` (local + fetch) — via runtime registry + Proxy, not code-gen (see spec §14 implementation note)
- [x] Auto-mounted RPC API `/api/plugins/{name}/{method}` + `access` enforcement + raw escape hatch (`src/api/routes/plugins.ts`)
- [x] Plugin Drizzle schema collection + `plugin_{alias}_` prefix convention guard (crash-loud at config resolution)
- [ ] `db:generate`/`db:migrate` CLI wrappers feeding plugin schemas to drizzle-kit (SQLite-only) — **deferred** until the first table-shipping plugin exists to validate against; no v1 plugin ships tables ("build the road, drive later")
- [x] Failure isolation (boot crash-loud: `requiredEnv` validation + `setup()` via `bootPlugins`; before-aborts/after-swallows; per-request via `app.onError`; per-job via cron runner try/catch). Plugin `cron` jobs registered auto-namespaced (`plugin:{name}:{job}`); `schedule` is metadata until the runner supports cadences
- [x] `dependsOn` existence + semver checks; ordering by `plugins: []` (dependency must be listed before its dependent — crash-loud)
- [x] ~~Non-UI code-gen virtual modules (`local`, `fetch`, `server`)~~ — **obsolete**: the runtime registry + Proxy approach made non-UI codegen unnecessary (spec §14 implementation note); codegen remains for 18b browser surfaces (components/i18n)
- [x] **Ship `@astromech/redirects`** — redirect entry type + slug-change `entry:afterUpdate` hook + `lookup` SDK; near-zero UI

### 18b — Plugin Admin UI

- [x] Field-group `placement: 'tab'` + edit-page tab strip (renamed `FieldGroup.location` → `placement` per spec terminology; shared `FieldGroupPanel`/`FieldGroupTabs` components)
- [x] `registerFieldType` (renderer + validator + defaultValue + typeGen) — declarative `fields: []` registrations; renderers lazy-load via the code-gen `virtual:astromech/plugins/components`; core-type/cross-plugin collisions crash at config resolution
- [x] Plugin nav tree; permission-gated auto-hide (admin-config carries `plugins[].nav`; sidebar renders a divided Plugins section, one nesting level, lucide icons by name; client `hasPermission` taught the `plugin:*` wildcard)
- [x] Pages under `/admin/plugin/{name}/*` + catch-all `_protected/plugin/$.tsx` (closes Phase 17.5 deferred item) — splat keys into code-gen'd `pages` map; lazy-loaded, permission-gated
- [x] Per-plugin React error boundaries with localized fallback (`PluginErrorBoundary` wraps plugin pages and field renderers; logs with plugin attribution)
- [ ] Auto-rendered settings page from `admin.settings`
- [ ] Public exports: `astromech/ui/fields`, `astromech/ui/layout`, `astromech/db`, `useAstromechPlugin()`
- [ ] Component + i18n code-gen virtual modules; type augmentation in `astromech.d.ts`
- [ ] **Ship `@astromech/seo`** — `seo-meta` field type + edit-page panel + dashboard + settings + sitemap/OG via SDK + length recommendations (non-AI)

### 18c — Compositional Integrations

- [ ] Form-builder custom field type
- [ ] Public `submit` API + file-upload raw escape hatch
- [ ] `forms:beforeSubmit`/`forms:afterSubmit` hook events
- [ ] Built-in reCAPTCHA/Turnstile/Mailchimp via those hooks (dogfooding principle)
- [ ] **Ship `@astromech/forms`** — `form` + `submission` entry types, form-builder field, public submission API, frontend form helper/component

---

## Phase 19 — Plugins (First-Party, Future)

Built on the proven 18a–18c foundation. (`@astromech/redirects`, `seo`, `forms` ship inside Phase 18 as slice validators.)

- [ ] `@astromech/analytics` — tracking-script management + dashboard page
- [ ] `@astromech/activity-log` — audit log (Drizzle table escape valve)
- [ ] `@astromech/backups`
- [ ] `@astromech/comments`
- [ ] `@astromech/import-export`

> Note: `@astromech/translations` is **dropped** — multi-locale content is now a core feature (see `specs/symmetric-locale-model.md`), not a plugin.

---

## Phase 20 — Blocks Field ✅

- [x] Add `BlockDefinition` type and `'blocks'` to `FieldType` union (`src/types/fields.ts`)
- [x] `src/admin/hooks/use-blocks-field.ts` — state hook (add, remove, duplicate, toggle disabled, reorder)
- [x] `src/admin/components/fields/blocks-field.tsx` — component with block picker dropdown, collapsible panels, drag handle
- [x] Drag-to-reorder via `@dnd-kit/core` + `@dnd-kit/sortable`
- [x] Per-block controls: disable/enable, duplicate, delete, collapse/expand
- [x] Register in `field-input.tsx` dispatcher and `field-config.ts`
- [x] Type generation support (`src/core/type-generator.ts`)
- [x] i18n strings (`src/admin/locales/en.json`)

---

## Phase 20.5 — SDK Query API & Route Improvements ✅

- [x] Default API path changed from `/api/cms` to `/api` (configurable via `apiRoute` in config)
- [x] `adminRoute` and `apiRoute` both configurable in `AstromechConfig` to avoid conflicts with existing app routes
- [x] Swagger UI URL made dynamic — respects configured `apiRoute`
- [x] `SortOption` redesigned to Drizzle-style `Record<string, 'asc' | 'desc'>` (e.g. `{ createdAt: 'desc' }`)
- [x] Consolidated entries query API — `all()`, `paginate()`, `where()`, `trashed()` replaced by single `query()` method
- [x] `query()` params: `type`, `search`, `where`, `trashed`, `page`, `limit` (`number | 'all'`), `sort`, `populate`, `locale`
- [x] `QueryResult<T>` generic return type — `{ data: T[], pagination: { page, limit, total, pages } | null }`; pagination is `null` when `limit: 'all'`
- [x] `GET /entries/:type/trashed` route removed — use `query({ trashed: true })` instead
- [x] Sort field validation — whitelist enforced in API route before passing to Drizzle
- [x] Users `query()` — replaces `all()`; supports `search`, `page`, `limit`, `sort`
- [x] Media `query()` — replaces `all()` and `list()`; supports `search`, `where.mimeType`, `page`, `limit`
- [x] `mimeType` filter on media lives inside `where` object for consistency with field filters on other resources
- [x] Hook renames: `useEntriesList` → `useEntriesQuery`, `useMediaList` → `useMediaQuery`, `useUsersList` → `useUsersQuery`

---

## Phase 21 — Image Optimisation (Future)

- [ ] Sharp integration (Node.js / Bun runtimes)
- [ ] Cloudflare Images or Workers-compatible alternative
- [ ] Generate responsive variants (configurable sizes)
- [ ] Store variants in media record

---

## Phase 21.5 — Multi-Runtime & Framework Adapter Architecture (Future)

- [ ] Document the adapter contract (`RuntimeAdapter`, `FrameworkAdapter` types) in `src/types/`
- [ ] Runtime auto-detection utility (`src/core/runtime.ts`) — detects Cloudflare Workers, Node, Bun, Deno from globals
- [ ] `astromech/node` — standalone Node/Bun HTTP adapter
- [ ] `astromech/sveltekit` — SvelteKit framework adapter
- [ ] `astromech/nextjs` — Next.js framework adapter

---

## Phase 22 — Storage Drivers (Future)

- [ ] `src/storage/drivers/s3.ts` — S3-compatible driver (`@aws-sdk/client-s3`)
- [ ] `src/storage/drivers/r2-binding.ts` — Cloudflare Workers native R2 binding driver
- [ ] Update `StorageDriver` type and `AstromechConfig` storage config to accept new driver options
- [ ] Update `astromech/cloudflare` adapter to wire up R2 binding from the Workers `env` object

---

## Phase 23 — Additional Database Drivers (Future)

- [ ] `src/db/drivers/postgres.ts` — Postgres driver
- [ ] `src/db/drivers/mysql.ts` — MySQL driver
- [ ] Drizzle schema variants for Postgres/MySQL column types
- [ ] Migration pipeline per dialect
- [ ] Update `AstromechConfig` DB config type to accept driver options for each dialect
- [ ] Test coverage for each new driver

---

## Phase 24 — Notifications System (Future)

### DB & Core

- [ ] `notificationsTable` in `src/db/schema.ts` — columns: `id`, `type`, `title`, `message`, `userId`, `readBy`, `createdAt`, `expiresAt`
- [ ] `src/db/repositories/notifications.ts` — `NotificationsRepository`: `create()`, `list()`, `markRead()`, `markAllRead()`, `deleteExpired()`
- [ ] Built-in CRON job to purge expired notifications (`src/cron/jobs/notifications-purge.ts`)

### Notification Service

- [ ] `src/notifications/index.ts` — `notify(notification)` helper
- [ ] Anti-spam rules: rate-limit per `source`, duplicate suppression within a time window
- [ ] Built-in notifications wired up: scheduled entry published, version restored, trash auto-purged, CRON job errors

### API & SDK

- [ ] `GET /api/cms/notifications` — list notifications for current user; supports `?unread=true`
- [ ] `POST /api/cms/notifications/:id/read` — mark single notification read
- [ ] `POST /api/cms/notifications/read-all` — mark all read
- [ ] Add `notifications` namespace to server SDK and fetch SDK: `list()`, `markRead()`, `markAllRead()`
- [ ] Plugin context exposes `notify()` so plugins can push notifications from `setup()` hooks

### Admin UI

- [ ] Poll `GET /api/cms/notifications?unread=true` every 30s from topbar
- [ ] Bell icon badge shows unread count
- [ ] Dropdown panel: notification list, mark-all-read button

---

## Phase 25 — Global Search (Future)

### Phase 25a — Title Search

- [ ] Add `searchable?: false` to `EntryTypeConfig`
- [ ] `GET /api/cms/search?q=...` — queries `title` across all searchable entry types + users + media
- [ ] Add `search(query)` to server SDK and fetch SDK
- [ ] Update command palette to call the search endpoint and render grouped results

### Phase 25b — Full-Text Search Indexing (Future)

- [ ] Add `search_index` text column to `entriesTable`
- [ ] Add `searchable?: false` per field in `FieldConfig` to exclude fields from the index
- [ ] Rebuild index on entry save; provide `astromech entries:reindex` CLI command for backfilling
- [ ] Switch `GET /api/cms/search` to query `search_index` column

---

## Phase 25.5 — Admin UI Polish (Future)

- [ ] Update user pages to match entry pages styling — same layout patterns, breadcrumb, page header
- [ ] Fix toggle group button sizing
- [ ] Date format config — derive from i18n locale (`en-GB`, `en-US`, `fr`, etc.)
- [ ] Fix entry data not loading on edit page — fields empty on first load
- [ ] Search param persistence — sync entry/media/user index page search bar to URL search params
- [ ] Entry index locale column — show locale codes for translatable entry types

---

## Phase 25.6 — Mobile Responsiveness (Future)

### Navigation

- [ ] `Topbar.tsx` — add hamburger/menu button on small screens (hidden on desktop)
- [ ] `Sidebar.tsx` — convert to an off-canvas drawer on mobile: hidden by default, slides in on menu button tap, closes on backdrop tap or nav link click
- [ ] `UIContext` — add `sidebarOpen` state toggled by the menu button
- [ ] Sidebar drawer uses CSS-only transitions

### Entry index / list pages

- [ ] Default to grid view when viewport is mobile-sized (`< 768px`); persist desktop preference separately
- [ ] Table view on mobile: wrap the table in a horizontally scrollable container (`overflow-x: auto`)
- [ ] View toggle (list/grid) remains available on mobile

### Forms

- [ ] Entry create/edit layout: collapse two-column main/sidebar layout to single column on mobile
- [ ] Publish panel sidebar stacks below the main fields column

### General

- [ ] Audit all admin pages for horizontal overflow issues at `375px` width
- [ ] Touch target sizes — buttons and interactive elements meet 44px minimum

---

## Phase 26 — Populate & Complex Field Data Model (Future)

### Media populate

- [ ] Design a `populate` pass for media IDs embedded in fields JSON: extract all IDs in a single traversal, fetch in one `WHERE id IN (...)` query, reinsert hydrated objects back into the JSON tree
- [ ] Handle media IDs inside repeater rows, block items, and group fields in the same pass
- [ ] Extend `populate` option on SDK `all()` / `get()` to include `'media'` alongside relation population

### Relationship keys in repeaters and blocks

- [ ] Decide: UUID-keyed objects vs arrays for repeater/block item storage
- [ ] If adopting UUID keys: migration strategy for existing repeater data
- [ ] Update `relationships` key naming convention for nested fields to use stable UUID-based paths
- [ ] Ensure drag-to-reorder in repeaters and blocks updates `_order` fields without regenerating keys
