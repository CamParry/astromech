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
- [x] Translation cascade on trash/restore/delete:
    - [x] `trash(id)` — also trash all entries where `translationOf = id`
    - [x] `restore(id)` — also restore all entries where `translationOf = id`
    - [x] `delete(id)` — also delete all entries where `translationOf = id`
    - [x] Add `ON DELETE CASCADE` to `translationOf` column as DB-level safety net

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

## Phase 16.5 — Config Separation & Framework Adapters

Decouple Astromech config from the Astro integration. Config lives in a standalone
`astromech.config.ts`; framework adapters import it and bridge it. Core is mountable
on any framework that can pass request/response.

- [x] Extract Astro integration from `src/index.ts` into `src/adapters/astro.ts`
- [x] `src/index.ts` becomes framework-agnostic: exports `defineConfig`, `defineCollection`, `definePlugin`, types only
- [x] Add `astromech/astro` export pointing to `src/adapters/astro.ts`
- [x] Update `package.json` exports map
- [x] Update `tsup.config.ts` — add `src/adapters/astro.ts` as entry point
- [x] Create `demo/astromech.config.ts` — demo config extracted from `demo/astro.config.mjs`
- [x] Update `demo/astro.config.mjs` — import config from `astromech.config.ts`, use `astromech/astro`

---

## Phase 17 — CLI (Future)

Thin CLI — commands are wrappers around the server SDK. Config loaded at runtime via
`jiti` (loads `astromech.config.ts` without pre-compilation). Binary: `astromech`.
Built with Citty.

### Setup
- [ ] Install `citty` and `jiti`
- [ ] `src/cli/index.ts` — CLI entry point, registers all commands
- [ ] `src/cli/config.ts` — loads `astromech.config.ts` using jiti, resolves config, initialises DB
- [ ] Register `"astromech": "./dist/cli/index.js"` in `package.json#bin`
- [ ] Add `src/cli/index.ts` as tsup entry

### DB commands
- [ ] `astromech db:init` — run Drizzle migrations; checks DB is empty first; `--force` skips check
- [ ] `astromech db:status` — show which migrations have been applied

### User commands
- [ ] `astromech users:create` — interactive prompts (name, email, password, role); primary path for initial admin setup
- [ ] `astromech users:list` — list all users (table output)
- [ ] `astromech users:get <id>` — get a single user by ID
- [ ] `astromech users:delete <id>` — delete a user; `--force` skips confirmation

### Entry commands
- [ ] `astromech entries:list <collection>` — list entries; `--status`, `--limit` flags
- [ ] `astromech entries:get <collection> <id>` — get a single entry (JSON output)
- [ ] `astromech entries:delete <collection> <id>` — delete entry; `--force` skips confirmation

### Generate / Seed
- [ ] `astromech generate:types` — regenerate SDK types from config
- [ ] `astromech seed` — run `seed.ts` at project root if present

---

## Phase 18 — Plugin UI System (Future)

- [ ] Define `AdminRoute` type in plugin config
- [ ] Add `adminRoutes?: AdminRoute[]` to `AstromechPlugin` type
- [ ] Update `src/core/plugin-resolver.ts` to collect plugin `adminRoutes`
- [ ] Update virtual module to include resolved admin routes
- [ ] Update `src/admin/router.tsx` to register plugin routes dynamically
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

## Extra Thoughts

- Use React Email for email templating
- Plugins need to be able to define and send emails
- Maybe plugins should function as nested Hono apps
- Do we need to support other databases, or can we just support sqlite? Is there any benefit to supporting more databases?
- Do we need to support R2 explicitly or do we just use the R2 S3 SKD?
- If we only support sqlite and S3 complient storage do we even need drivers?
- What are the consideration for hosting on multiple runtimes? I think the main runtimes will be Cloudflare, Vercel, Node, and maybe Bun and Deno
- With the SDK we currently have server and client, but maybe we need to clarify things further: I can think of three different usages, first is purely client side, second is server side in the same codebase (intended usage), and third is server side but from an external app
- We will probably have to have some cors and origin config for the client SDK usage
- We probably want to move to TanStack router filesystem based routing instead of manually defining them all
- We might want to move to using TanStack routers page level data fetching, maybe not though
- We probably want to wrap up all of the current tanstack query usages in custom hooks, I like to call these "actions" but open to suggestions, I don't think we need to expose this, this can be admin specific so all the caching and optimistic updated makes sense
- We need to think if we want to give the admin users access in the setting to configure the mailer driver, or if this is only defined in the code
- We probably can move some of the /utils into /support
- Change i18n: true to translatable: true
- Global search needs to search collection entries as well
- We need a notifications system that add a list of notifictions to the bell button in the topbar
- We need to decide if media should really be a relationship, if it is how do we handle media in complex fields like repeaters and builders
- Ability to delete a translation (including the default one?)
