# Astromech Roadmap

## Phase 1 — Restructure & Foundation ✅

Reorganise the codebase to cleanly separate admin UI from core library code.

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

Replace the catch-all Astro API endpoint with a structured Hono app.

- [x] Install Hono (`hono`)
- [x] Create `src/api/index.ts` — root Hono app
- [x] Create `src/api/routes/entries.ts` — entries CRUD
- [x] Create `src/api/routes/users.ts` — users CRUD
- [x] Create `src/api/routes/media.ts` — media upload/list/delete
- [x] Create `src/api/routes/settings.ts` — settings read/write
- [x] Create `src/api/routes/collections.ts` — collection metadata endpoint (used by SPA to discover collections/fields)
- [x] Create `src/api/middleware/auth.ts` — Hono middleware to validate session
- [x] Create `src/api/middleware/errors.ts` — consistent error response format
- [x] Update `src/routes/api.ts` to delegate to `app.fetch(request)` only
- [x] Ensure all existing entry operations (filter, sort, paginate, trash, duplicate, slug) are exposed

---

## Phase 3 — SPA Infrastructure ✅

Wire up the SPA build pipeline and base routing.

- [x] Install dependencies: `@tanstack/react-router`, `@tanstack/react-query`, `i18next`, `react-i18next`
- [x] Create `src/admin/main.tsx` — SPA entry point (mounts React into `#root`)
- [x] Create `src/admin/router.tsx` — TanStack Router root config (basepath = adminRoute)
- [x] Create `src/admin/shell.astro` — catch-all Astro page, renders bare `<div id="root">` + SPA script
- [x] Update `src/core/route-registration.ts` to register the shell page at `${adminRoute}/[...path]`
- [x] Add `virtual:astromech/admin-config` Vite plugin — safe client-side subset of resolved config
- [x] Set up `src/admin/i18n.ts` — i18next initialisation
- [x] Create `src/admin/locales/en.json` — English strings
- [x] Verified: dev server serves shell HTML with `<div id="root">` and Vite bundles `main.tsx`

---

## Phase 4 — Auth & Session ✅

Move all auth pages into the SPA; establish session management pattern.

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

Establish the shell layout that wraps all admin pages.

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

## Phase 6 — UI Component Library (`astromech/ui`) ✅

Build the component library that both core pages and plugins consume.

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
- [x] Define all design tokens in `src/admin/styles/partials/theme.css` (colour, spacing, radius, shadow, typography)
- [x] Ensure `[data-theme="dark"]` overrides work for all tokens
- [x] Add `astromech/ui` export entry in `package.json` + `tsup.config.ts`
- [x] Document component props (TypeScript types serve as documentation)

---

## Phase 7 — Admin Pages ✅

Rebuild all core admin pages as React SPA pages using the component library.

### Dashboard

- [x] `src/admin/pages/dashboard.tsx`
- [x] Summary cards (total entries per collection, recent activity)

### Collections

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

> User creation will be handled via the CLI (`astromech users:create`) — no create page needed.

### Settings

- [x] `src/admin/pages/settings/index.tsx` — placeholder (settings coming soon)
    - [ ] General settings (site name, etc.)
    - [ ] Extensible sections (plugins can contribute settings panels)

---

## Phase 8 — Fields (Remaining) ✅

All field types implemented. Full list:

- [x] Text, URL, Password, Email, Textarea, Number, Boolean, Date, Datetime, Color
- [x] Select, Multiselect, Media, Relation, Repeater, Slug, Richtext (TipTap)
- [x] JSON, Group, Checkbox Group, Radio Group, Range, Link, Key-Value
- [x] Accordion (visual), Tab (visual)
- [x] Media field (multiple mode) — up/down reorder + `accept` option

---

## Phase 9 — Media Library ✅

Full media management within the SPA.

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
- [x] Drag-to-reorder in multiple mode (completed in Phase 8)

---

## Phase 10 — SDK & Type Generation ✅

Ensure both SDKs are complete, typed, and consistent.

- [x] `src/sdk/server/index.ts` — collections, users, media complete
- [x] `src/sdk/client/index.ts` — mirrors server SDK for collections, users, media
- [x] `astromech/server` and `astromech/client` exports in `package.json`
- [x] Complete settings API implementation (both server & client)
- [x] Generate collection-specific TypeScript types from config
- [x] SDK handles relations: `populate` option returns typed related entries
- [x] SDK: version history methods — deferred to Phase 13 (Versions)
- [x] SDK: translation methods — deferred to Phase 15 (Translations)

---

## Phase 10.1 — SDK Rename + Security Hardening ✅

### SDK Rename: `local` + `fetch`

- [x] `astromech/server` → `astromech/local` — direct DB access, same codebase only
- [x] `astromech/client` → `astromech/fetch` — HTTP-based, works in browser, external servers, or any environment
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
- [x] Email driver registry (`src/email/registry.ts`) — same globalThis pattern as storage/db

---

## Phase 11.5 — React Email Migration (Future)

Replace string-based email templates with React Email components. Plugins get a first-class way to define and send emails using the same system.

- [ ] Install `@react-email/components` and `@react-email/render`
- [ ] Create `src/email/components/` — React Email components live here
- [ ] Rewrite `src/email/templates/base.ts` as a React Email base layout component
- [ ] Rewrite `src/email/templates/password-reset.ts` as a React Email component
- [ ] Create `src/email/render.ts` — `renderEmail(element): Promise<{ html: string; text: string }>` helper (wraps `@react-email/render`)
- [ ] Update all internal `send()` call sites to use `renderEmail()` before passing to driver
- [ ] Add `sendEmail(to, subject, element)` utility to `AstromechContext` so plugins can send emails from `setup()`
- [ ] Add `emails?: EmailTemplateOverride[]` to `AstromechPlugin` — lets plugins replace built-in templates (e.g. swap the password reset design for their own branded version)
- [ ] Update plugin resolver to collect and apply email template overrides
- [ ] Export `renderEmail` and base email components from a public `astromech/email` entry point so plugins can build on the same primitives

---

## Phase 12 — Roles & Permissions ✅

> Roles are code-defined in `AstromechConfig.roles`. Two built-in roles: `admin` (full access) and `editor` (collections + media, no users/settings). No database-backed role management UI in this phase.

- [x] Uncomment / implement `roles` table in DB schema (done in Phase 10.5)
- [x] Roles defined in code via `AstromechConfig.roles` + built-in defaults (admin, editor)
- [x] Permission checking utility in `src/core/permissions.ts`
- [x] Enforce permissions in all API handlers (entries, users, media, settings)
- [x] Add role assignment to user create/edit
- [x] Conditionally show/hide admin UI elements based on current user permissions
- [x] Read-only form mode for users with entry:read but not entry:update

---

## Phase 13 — Versions ✅

- [x] Uncomment / implement `entry_versions` table in DB schema (done in Phase 10.5)
- [x] Add `slug` and `relations` columns to `entryVersionsTable` (snapshot includes relation/media IDs)
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
- [x] `publishedAt` column in entries schema (dual-use: stores future publish time for scheduled, actual publish time for published)
- [x] Scheduling UI — date/time picker for `publishAt` (conditional on status = scheduled)
- [x] Dedicated publish / unpublish / schedule API endpoints (`POST .../publish`, `.../unpublish`, `.../schedule`)
- [x] CRON job to transition `scheduled → published` at `publishAt` time
- [x] `PublishPanel` component — extracted sidebar panel used in create/edit pages
- [x] SDK: `publish(id)`, `unpublish(id)`, `schedule(id, publishAt)` — server + client

---

## Phase 15 — Translations ✅

Architecture: each locale is a separate entry row; `translationOf` FK points to source. All entries carry an explicit locale (defaultLocale for source/non-i18n entries). No data migration when enabling i18n on an existing collection.

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
- [x] Entry list: translation count badge per row when `i18n` enabled
- [ ] Rename `CollectionConfig.i18n` → `translatable` — clearer intent, avoids confusion with admin UI language (`i18n` is overloaded); breaking config change, update demo + type generator + all internal references
- [x] Translation cascade on trash/restore/delete:
    - [x] `trash(id)` — also trash all entries where `translationOf = id`
    - [x] `restore(id)` — also restore all entries where `translationOf = id`
    - [x] `delete(id)` — also delete all entries where `translationOf = id`
    - [x] Add `ON DELETE CASCADE` to `translationOf` column as DB-level safety net

---

## Phase 15.5 — Translation Deletion & Primary Promotion (Future)

> Two distinct concepts: **primary** (`translationOf IS NULL`) is an internal grouping concept only — it has no effect on SDK data fetching. **`defaultLocale`** is the SDK fallback when no locale is specified. Multi-lang sites should always pass `locale` explicitly to the SDK to avoid ambiguity.

### Deleting a non-primary translation

- [ ] Delete single locale: removes only that entry row; primary and other siblings unaffected
- [ ] If the entry has incoming relations from other entries: show a warning in the confirmation modal ("X entries link to this entry") — user proceeds at their own risk, no automatic repointing
- [ ] Confirmation modal offers a secondary option to delete all locale variants at once
- [ ] API: `DELETE /entries/:type/:id` gains a `?cascade=true` query param to delete all siblings
- [ ] SDK: `delete(id, { cascade?: boolean })`

### Deleting a primary translation (translationOf = null)

- [ ] If the entry has no sibling translations: delete proceeds normally
- [ ] If sibling translations exist: automatically promote the first sibling that exists in config `locales` order (e.g. config `['en', 'fr', 'es']`, EN deleted, FR exists → FR promoted)
  - Promoted entry: `translationOf` set to `null`
  - Remaining siblings: `translationOf` repointed from old primary ID to new primary ID
  - Old primary then deleted
- [ ] If the entry has incoming relations from other entries: show warning in the confirmation modal before proceeding
- [ ] Confirmation modal also offers "delete all translations" as an alternative to auto-promotion
- [ ] API: `POST /entries/:type/:id/promote` — internal helper used by the delete flow; promotes an entry to primary and repoints siblings
- [ ] SDK: `delete(id, { cascade?: boolean })` handles promotion transparently; no separate `promote()` exposed to users

### Entry index page

- [ ] List view filters by `translationOf IS NULL` — always shows the primary entry regardless of its locale
- [ ] Locale badge on each row reflects the actual locale of the primary entry
- [ ] `defaultLocale` is not used as a data filter in the index; it remains an SDK-level fetch default only

---

## Phase 16 — CRON System ✅

- [x] Define CRON job interface (`CronJob`, `CronContext`) in `src/cron/registry.ts`
- [x] Register CRON jobs via `registerCronJob()` — globalThis registry pattern, plugins can call it from `setup()`
- [x] `runScheduledJobs()` runner — executes all registered jobs, exported as `handleScheduled` for Cloudflare Workers scheduled events
- [x] HTTP trigger: `POST /api/cms/cron/run` (admin-only) for non-Cloudflare runtimes and manual invocation
- [x] Built-in CRON: scheduled publishing transition (`src/cron/jobs/scheduled-publish.ts`)
- [x] Built-in CRON: trash auto-purge (`src/cron/jobs/trash-purge.ts`)
- [x] CRON-based version trimming using `maxVersions` config (deferred from Phase 13)

---

## Phase 16.5 — Config Separation & Framework Adapters ✅

Decouple Astromech config from the Astro integration. Config lives in a standalone
`astromech.config.ts`; framework adapters import it and bridge it. Core is mountable
on any framework that can pass request/response.

- [x] Extract Astro integration from `src/index.ts` into `src/adapters/astro.ts`
- [x] `src/index.ts` becomes framework-agnostic: exports `defineConfig`, `defineEntryType`, `definePlugin`, types only
- [x] Add `astromech/astro` export pointing to `src/adapters/astro.ts`
- [x] Update `package.json` exports map
- [x] Update `tsup.config.ts` — add `src/adapters/astro.ts` as entry point
- [x] Create `demo/astromech.config.ts` — demo config extracted from `demo/astro.config.mjs`
- [x] Update `demo/astro.config.mjs` — import config from `astromech.config.ts`, use `astromech/astro`

---

## Phase 16.6 — Entries Rename & SDK Redesign ✅

Rename "collections" to "entries" throughout. Cleaner semantic model: entry types are
defined in config; entries are individual records; `type` is the discriminator field.
SDK moves from a per-collection proxy to a unified `Astromech.entries` API.

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

## Phase 17 — CLI ✅

Thin CLI — commands are wrappers around the server SDK. Config loaded at runtime via
`jiti` (loads `astromech.config.ts` without pre-compilation). Binary: `astromech`.
Built with Citty.

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
- [x] `astromech users:create` — interactive prompts (name, email, password, role); primary path for initial admin setup
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

Extract all `useQuery` / `useMutation` calls from page components into a structured hook layer that mirrors the fetch SDK's API shape. Keeps data-fetching logic out of components and gives a single consistent pattern across the admin.

> Pattern: `Astromech.entries.useAll({ type })`, `Astromech.entries.useGet(id)`, `Astromech.entries.useCreate()`, `Astromech.entries.useUpdate()`, etc. Each hook wraps the corresponding `astromech/fetch` method with TanStack Query. Mutation hooks handle cache invalidation internally via shared query key factories.

- [x] Define query key factories per resource (`entriesKeys`, `mediaKeys`, `usersKeys`) in `src/admin/hooks/query-keys.ts`
- [x] `src/admin/hooks/entries.ts` — `useEntries()`, `useEntry()`, `useCreateEntry()`, `useUpdateEntry()`, `useDeleteEntry()`, `usePublishEntry()`, etc.
- [x] `src/admin/hooks/media.ts` — `useMedia()`, `useUploadMedia()`, `useDeleteMedia()`, etc.
- [x] `src/admin/hooks/users.ts` — `useUsers()`, `useUser()`, `useUpdateUser()`, etc.
- [x] Replace all inline `useQuery` / `useMutation` calls in admin pages with the new hooks
- [ ] Future: `astromech/react` public export once cache invalidation across hook boundaries is figured out

---

## Phase 17.5 — TanStack Router File-Based Routing ✅

Migrate the admin SPA from manually-defined routes in `src/admin/router.tsx` to TanStack Router's file-based routing. Route files in `src/admin/pages/` are scanned at build time; the route tree is generated automatically.

- [x] Install `@tanstack/router-plugin` and wire into Astro's Vite config (`vite.plugins`)
- [x] Configure `routesDirectory: 'src/admin/pages'` and `generatedRouteTree: 'src/admin/routeTree.gen.ts'`
- [x] Add `src/admin/routeTree.gen.ts` to `.gitignore` (build artifact)
- [x] Rename page files to TanStack Router file conventions (`_layout.tsx`, `$param.tsx`, `index.tsx`, etc.)
- [x] Delete manual route definitions from `src/admin/router.tsx`; import generated route tree instead
- [ ] Migrate per-route search params, loaders, and `beforeLoad` guards to co-located route files
- [ ] Verify plugin route merging still works (plugin routes use code-based API alongside the generated tree — TanStack supports mixing both)

---

## Phase 18 — Plugin Architecture & UI System (Future)

### Plugin Architecture

Revisit the plugin contract before first-party plugins are built. Key open questions:

- Introduce `defineAstromechPlugin(config)` wrapper (mirroring `defineConfig`, `defineEntryType`) to enforce a consistent plugin shape and enable future validation/DX improvements
- Replace flat `routes?: Route[]` with a mounted Hono sub-app — each plugin provides a `Hono` instance that the core mounts at `/api/cms/plugins/<name>/`. Keeps plugin routing isolated and gives plugins full Hono feature access (grouped routes, scoped middleware, RPC types). May keep flat `routes` as a convenience shorthand for simple cases.
- Decide: should `middleware` remain flat or also move to the sub-app?

- [ ] Finalise `defineAstromechPlugin` API and update `AstromechPlugin` type (`src/types/plugins.ts`)
- [ ] Switch plugin API routes to mounted Hono sub-apps; update plugin resolver and root Hono app
- [ ] Update first-party plugin stubs (Phase 19) to use the new pattern

### Plugin UI System

Plugin pages follow the same TanStack Router patterns as core pages (see Phase 17.5), but plugins are npm packages so they can't participate in file-based routing directly. Instead, plugins export code-based route definitions that are merged into the router at build time via the Vite plugin.

- [ ] Define `PluginAdminRoute` type — wraps a TanStack Router route definition with metadata (path, nav label, icon, permission required)
- [ ] Add `adminRoutes?: PluginAdminRoute[]` to `AstromechPlugin` type
- [ ] Update `src/core/plugin-resolver.ts` to collect plugin `adminRoutes`
- [ ] Update virtual module to include resolved plugin routes
- [ ] Update router setup to merge plugin code-based routes into the file-based route tree
- [ ] Update `Sidebar.tsx` to render plugin-contributed nav items
- [ ] Define page extension points (entry edit tabs, sidebar panels)

---

## Phase 19 — Plugins (First-Party, Future)

- [ ] `@astromech/seo` — SEO field group + sitemap route
- [ ] `@astromech/redirects` — redirects collection + middleware
- [ ] `@astromech/translations` — multi-language content
- [ ] `@astromech/forms` — form builder collection + submission handling
- [ ] `@astromech/analytics` — analytics dashboard page

---

## Phase 20 — Blocks Field ✅

A `blocks` field type: an ordered list of typed content blocks, each with its own field set. Like a repeater but with multiple named block types. Common use case: page sections/layouts.

- [x] Add `BlockDefinition` type and `'blocks'` to `FieldType` union (`src/types/fields.ts`)
- [x] `src/admin/hooks/use-blocks-field.ts` — state hook (add, remove, duplicate, toggle disabled, reorder)
- [x] `src/admin/components/fields/blocks-field.tsx` — component with block picker dropdown, collapsible panels, drag handle
- [x] Drag-to-reorder via `@dnd-kit/core` + `@dnd-kit/sortable` — each `BlocksField` has its own `DndContext` (nested builders isolated)
- [x] Per-block controls: disable/enable, duplicate, delete, collapse/expand
- [x] Register in `field-input.tsx` dispatcher and `field-config.ts`
- [x] Type generation support (`src/core/type-generator.ts`)
- [x] i18n strings (`src/admin/locales/en.json`)

---

## Phase 21 — Image Optimisation (Future)

Server-side image processing on upload.

- [ ] Sharp integration (Node.js / Bun runtimes)
- [ ] Cloudflare Images or Workers-compatible alternative
- [ ] Generate responsive variants (configurable sizes)
- [ ] Store variants in media record

---

## Phase 21.5 — Multi-Runtime & Framework Adapter Architecture (Future)

> Current focus: Astro + Cloudflare Workers. The architecture must be built to support other runtimes and frameworks without refactoring core. All runtime-specific behaviour is pushed to adapter layers; core remains fully portable.

### Adapter layers

| Layer | Current | Planned |
|---|---|---|
| **Runtime** | Cloudflare Workers (implicit) | Node, Bun, Deno — auto-detect or explicit config |
| **Framework** | `astromech/astro` | SvelteKit, Next.js, Nuxt, standalone Node/Bun HTTP |
| **Database** | libsql, D1 binding | Postgres, MySQL (Phase 23) |
| **Storage** | filesystem | S3-compatible, R2 binding (Phase 22) |
| **Email** | SMTP, Resend, Console | driver interface already extensible |

### Runtime adapter responsibilities
A runtime adapter is responsible for:
- Detecting or receiving the runtime environment (e.g. Cloudflare `env`, Node `process.env`)
- Initialising the correct DB, storage, and email drivers for that runtime
- Wiring up CRON (Workers scheduled event vs HTTP trigger vs OS cron)
- Exporting a `handleRequest(request, env?)` entry point the framework adapter calls

### Framework adapter responsibilities
A framework adapter wraps the runtime adapter and bridges it to a specific framework's request/response model. `astromech/astro` is the reference implementation.

### Tasks
- [ ] Document the adapter contract (`RuntimeAdapter`, `FrameworkAdapter` types) in `src/types/`
- [ ] Runtime auto-detection utility (`src/core/runtime.ts`) — detects Cloudflare Workers, Node, Bun, Deno from globals
- [ ] `astromech/node` — standalone Node/Bun HTTP adapter (uses libsql + filesystem/S3 by default)
- [ ] `astromech/sveltekit` — SvelteKit framework adapter
- [ ] `astromech/nextjs` — Next.js framework adapter
- [ ] Each new framework adapter follows the same pattern as `astromech/astro`

---

## Phase 22 — Storage Drivers (Future)

> Current support: local filesystem only (`src/storage/filesystem.ts`). The registry pattern matches DB drivers — set once at startup, resolved at request time.

- [ ] `src/storage/drivers/s3.ts` — S3-compatible driver (`@aws-sdk/client-s3`); configurable endpoint covers AWS S3, Cloudflare R2 (via HTTP), Backblaze B2, MinIO
- [ ] `src/storage/drivers/r2-binding.ts` — Cloudflare Workers native R2 binding driver (`env.BUCKET.put/get/delete`); skips HTTP for lower latency inside Workers. Mirrors the D1 binding pattern.
- [ ] Update `StorageDriver` type and `AstromechConfig` storage config to accept new driver options
- [ ] Update `astromech/cloudflare` (or adapter) to wire up R2 binding from the Workers `env` object — same approach as D1

---

## Phase 23 — Additional Database Drivers (Future)

> Current support: SQLite via libsql (Node/Bun) and D1 (Cloudflare Workers). The driver abstraction in `src/db/drivers/` is designed to accommodate additional dialects without breaking changes.

- [ ] `src/db/drivers/postgres.ts` — Postgres driver (via `drizzle-orm/postgres-js` or `drizzle-orm/node-postgres`)
- [ ] `src/db/drivers/mysql.ts` — MySQL driver (via `drizzle-orm/mysql2`)
- [ ] Drizzle schema variants for Postgres/MySQL column types (separate schema files or conditional column helpers)
- [ ] Migration pipeline per dialect — Drizzle Kit config needs to be dialect-aware
- [ ] Update `AstromechConfig` DB config type to accept driver options for each dialect
- [ ] Test coverage for each new driver

---

## Phase 24 — Notifications System (Future)

> Rule of thumb: **sync operations use toasts, async operations use notifications**. A publish action completing immediately → toast. A scheduled entry going live at 3am → notification.

### DB & Core

- [ ] `notificationsTable` in `src/db/schema.ts` — columns: `id`, `type` (`info | success | warning | error`), `title`, `message`, `userId` (nullable — `null` = global, visible to all admins), `readBy` (JSON array of user IDs), `createdAt`, `expiresAt` (nullable)
- [ ] `src/db/repositories/notifications.ts` — `NotificationsRepository`: `create()`, `list({ userId, unreadOnly })`, `markRead(id, userId)`, `markAllRead(userId)`, `deleteExpired()`
- [ ] Built-in CRON job to purge expired notifications (`src/cron/jobs/notifications-purge.ts`)

### Internal Notification Service

- [ ] `src/notifications/index.ts` — `notify(notification)` helper; thin wrapper over repository; available server-side for core and plugins
- [ ] Anti-spam rules enforced at `notify()` call site: rate-limit per `source` (plugin name) — max N notifications per hour; duplicate suppression (same `title` + `source` within a window deduplicates); plugins must declare a `source` field
- [ ] Built-in notifications wired up: scheduled entry published, version restored, trash auto-purged, CRON job errors

### API & SDK

- [ ] `GET /api/cms/notifications` — list notifications for current user (global + user-scoped); supports `?unread=true`
- [ ] `POST /api/cms/notifications/:id/read` — mark single notification read
- [ ] `POST /api/cms/notifications/read-all` — mark all read
- [ ] Add `notifications` namespace to server SDK (`astromech/local`) and fetch SDK (`astromech/fetch`): `list()`, `markRead()`, `markAllRead()`
- [ ] Plugin context (`AstromechContext`) exposes `notify()` so plugins can push notifications from `setup()` hooks

### Admin UI

- [ ] Poll `GET /api/cms/notifications?unread=true` every 30s from topbar
- [ ] Bell icon badge shows unread count
- [ ] Dropdown panel: notification list (icon, title, message, timestamp), mark-all-read button
- [ ] Clicking a notification marks it read; link to relevant resource if applicable

---

## Phase 25 — Global Search (Future)

### Phase 25a — Title Search

Search entry records from the command palette. All entry types are searchable by default; opt out per type with `searchable: false` in `EntryTypeConfig`.

- [ ] Add `searchable?: false` to `EntryTypeConfig` (`src/types/config.ts`)
- [ ] `GET /api/cms/search?q=...` — queries `title` across all searchable entry types + users + media; returns results grouped by resource type, ordered by relevance (case-insensitive match position)
- [ ] Add `search(query)` to server SDK (`astromech/local`) and fetch SDK (`astromech/fetch`)
- [ ] Update command palette (`src/admin/components/ui/command-palette.tsx`) to call the search endpoint and render grouped results (entry type label + title + edit link)

### Phase 25b — Full-Text Search Indexing (Future)

Long-term search solution that indexes all text content from entry fields into a dedicated searchable column.

- [ ] Add `search_index` text column to `entriesTable` — auto-populated on create/update by concatenating all text values from the fields JSON
- [ ] Add `searchable?: false` per field in `FieldConfig` to exclude sensitive or irrelevant fields from the index
- [ ] Rebuild index on entry save (sync) and provide a CLI command `astromech entries:reindex` for backfilling
- [ ] Switch `GET /api/cms/search` to query `search_index` column (SQLite FTS5 or simple LIKE depending on runtime support)
- [ ] Expose `searchIndex` in SDK types

---

## Phase 26 — Populate & Complex Field Data Model (Future)

> Design decisions to resolve before implementing. Two related but separable problems.

### Media populate (IDs in JSON → hydrated objects)

Media fields store IDs directly in the fields JSON blob, not in the `relationships` table. `populate` needs to reach inside the JSON to hydrate them efficiently.

- [ ] Design a `populate` pass for media IDs embedded in fields JSON: extract all media IDs in a single traversal, fetch in one `WHERE id IN (...)` query, reinsert hydrated objects back into the JSON tree — O(1) queries regardless of field depth or entry count
- [ ] Handle media IDs inside repeater rows, block items, and group fields in the same pass
- [ ] Extend `populate` option on SDK `all()` / `get()` to include `'media'` alongside relation population

### Relationship keys inside repeaters and blocks (open question)

Relationship fields nested inside repeaters or blocks are currently stored in the `relationships` table with a key derived from the field path. When rows are reordered the keys may go stale.

**Proposed approach:** store repeater/block items as objects keyed by stable UUIDs rather than arrays, with an explicit `_order` field in each item. The UUID key is assigned on creation and never changes — reordering updates `_order` values only, so relationship keys remain stable.

- [ ] Decide: UUID-keyed objects vs arrays — evaluate impact on field components, form state, and type generation before committing
- [ ] If adopting UUID keys: migration strategy for existing repeater data (arrays → keyed objects)
- [ ] Update `relationships` key naming convention for nested fields to use stable UUID-based paths
- [ ] Ensure drag-to-reorder in repeaters and blocks updates `_order` fields correctly without regenerating keys


