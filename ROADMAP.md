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
- [x] Create `src/api/routes/entities.ts` — entities CRUD
- [x] Create `src/api/routes/users.ts` — users CRUD
- [x] Create `src/api/routes/media.ts` — media upload/list/delete
- [x] Create `src/api/routes/settings.ts` — settings read/write
- [x] Create `src/api/routes/collections.ts` — collection metadata endpoint (used by SPA to discover collections/fields)
- [x] Create `src/api/middleware/auth.ts` — Hono middleware to validate session
- [x] Create `src/api/middleware/errors.ts` — consistent error response format
- [x] Update `src/routes/api.ts` to delegate to `app.fetch(request)` only
- [x] Ensure all existing entity operations (filter, sort, paginate, trash, duplicate, slug) are exposed

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
- [x] Summary cards (total entities per collection, recent activity)

### Collections
- [x] `src/admin/pages/collections/index.tsx` — entity list
  - [x] Table with sortable columns (from collection `columns` config)
  - [x] Search input
  - [x] Status filter (draft / published / scheduled / trash)
  - [x] Pagination
  - [x] Row actions: edit, duplicate, delete, trash/restore
  - [x] Bulk actions (delete, publish, trash)
  - [x] List/grid view toggle (persisted to localStorage)
- [x] `src/admin/pages/collections/create.tsx` — create entity form
- [x] `src/admin/pages/collections/edit.tsx` — edit entity form
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
  - [ ] `users/create.tsx` — create user form
  - [ ] Role assignment (when roles are implemented — Phase 12)

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
- [ ] **Builder** — drag-and-drop block builder (deferred, its own phase)

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
- [ ] Image optimisation via Sharp (server-side on upload)

---

## Phase 10 — SDK & Type Generation ✅

Ensure both SDKs are complete, typed, and consistent.

- [x] `src/sdk/server/index.ts` — collections, users, media complete
- [x] `src/sdk/client/index.ts` — mirrors server SDK for collections, users, media
- [x] `astromech/server` and `astromech/client` exports in `package.json`
- [x] Complete settings API implementation (both server & client)
- [x] Generate collection-specific TypeScript types from config
- [x] SDK handles relations: `populate` option returns typed related entities
- [ ] SDK: version history methods — deferred to Phase 13 (Versions)
- [ ] SDK: translation methods — deferred to Phase 15 (Translations)
- [ ] Integration tests — deferred to dedicated testing phase

---

## Phase 10.5 — Architecture Improvements ✅

- [x] Fix `any` types across codebase
- [x] Uncomment `roles` and `entity_versions` tables in DB schema
- [x] Uncomment performance indexes on entities table
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

## Phase 11 — Email System

- [ ] Define email adapter interface (`src/lib/email/types.ts`)
- [ ] Implement SMTP adapter
- [ ] Implement Resend/Postmark/SendGrid API adapter (at least one)
- [ ] Create base email layout template
- [ ] Create core email templates: welcome, password reset, email verification
- [ ] Wire into Better Auth `sendResetPassword` callback
- [ ] Add email config to `AstromechConfig`

---

## Phase 12 — Roles & Permissions

- [x] Uncomment / implement `roles` table in DB schema (done in Phase 10.5)
- [ ] Implement roles CRUD in API (`src/api/routes/roles.ts`)
- [ ] Implement permission checking middleware in Hono
- [ ] Add role assignment to user create/edit
- [ ] `src/admin/pages/settings/roles.tsx` — role management UI
- [ ] Enforce permissions in API handlers
- [ ] Conditionally show/hide admin UI elements based on current user permissions

---

## Phase 13 — Versions

- [x] Uncomment / implement `entity_versions` table in DB schema (done in Phase 10.5)
- [ ] Auto-save version on entity update (for collections with `versioning: true`)
- [ ] Implement `src/api/routes/versions.ts` — list, get, restore
- [ ] SDK: `versions(id)`, `restoreVersion(id, versionId)`
- [ ] `src/admin/components/versions/VersionHistory.tsx` — sidebar panel on entity edit

---

## Phase 14 — Publishing & Scheduling

- [x] Entity status field (draft / published / scheduled) in DB schema
- [x] Status UI in create/edit pages
- [x] Publish/unpublish bulk actions
- [ ] `publishAt` column in entities schema
- [ ] Scheduling UI — date/time picker for `publishAt`
- [ ] Dedicated publish / unpublish API endpoints
- [ ] CRON job to transition `scheduled → published` at `publishAt` time
- [ ] `PublishPanel` component
- [ ] SDK: publish, unpublish, schedule operations

---

## Phase 15 — Translations

- [ ] Implement `locale` and translation linking via relationships table
- [ ] Add `translationsPlugin` to plugin system
- [ ] Locale switcher in entity edit page
- [ ] `create translation` action from existing entity
- [ ] SDK: `translations(id)`, `translate(id, locale, data?)`, `get(id, { locale })`

---

## Phase 16 — CRON System

- [ ] Define CRON job interface (name, schedule, handler)
- [ ] Register CRON jobs via config / plugin `setup()`
- [ ] Implement Cloudflare Workers scheduled event handler
- [ ] Built-in CRON: scheduled publishing transition
- [ ] Built-in CRON: trash auto-purge

---

## Phase 17 — CLI (Future)

- [ ] `astromech db:init` — apply migrations
- [ ] `astromech db:generate` — generate migration from schema changes
- [ ] `astromech db:migrate` — run pending migrations (for CI/CD)
- [ ] `astromech generate` — generate types from config
- [ ] `astromech seed` — seed data from fixture files

---

## Phase 18 — Plugin UI System

- [ ] Define `AdminRoute` type in plugin config
- [ ] Add `adminRoutes?: AdminRoute[]` to `AstromechPlugin` type
- [ ] Update `src/core/plugin-resolver.ts` to collect plugin `adminRoutes`
- [ ] Update virtual module to include resolved admin routes
- [ ] Update `src/admin/router.tsx` to register plugin routes dynamically
- [ ] Update `Sidebar.tsx` to render plugin-contributed nav items
- [ ] Define page extension points (entity edit tabs, sidebar panels)

---

## Phase 19 — Plugins (First-Party, Future)

- [ ] `@astromech/seo` — SEO field group + sitemap route
- [ ] `@astromech/redirects` — redirects collection + middleware
- [ ] `@astromech/translations` — multi-language content
- [ ] `@astromech/forms` — form builder collection + submission handling
- [ ] `@astromech/analytics` — analytics dashboard page
