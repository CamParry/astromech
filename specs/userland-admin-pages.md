# Userland Admin Pages (app-defined settings pages)

Status: in progress (Phase 27a). Supersedes the abandoned "globals core concept"
(reverted). Mental model = WordPress/ACF **options page**: the app config declares
an admin page with a field schema; the admin renders a form; values read/write the
core `settings` table. "Globals" is just *one such page* defined in the demo — not a
framework primitive. Plugins already have this (`defineAdminPage({ settings })`); we
lift the same capability to the app config.

## Config API

```ts
// astromech.config.ts
import { defineSettingsPage } from 'astromech';

export default defineConfig({
  admin: {
    pages: [
      defineSettingsPage({
        path: 'globals',          // slug; route = /admin/page/globals; storage key = 'globals'
        label: 'Globals',
        icon: 'Settings',         // optional lucide name
        translatable: true,       // opt-in locale awareness (default false)
        fields: [                 // EntryFields tree (flat list or { main, sidebar })
          fields.text('siteName'),
          fields.media('logo', { translatable: false }),
          fields.repeater('footerLinks', { fields: [ fields.text('label'), fields.text('href') ] }),
        ],
      }),
    ],
  },
});
```

Types:
- `AppAdminPage = { path: string; label: Label; icon?: string; translatable?: boolean; fields: EntryFields }`
  (settings-page variant only for now; a `component?` custom-page variant is a later
  iteration — leave the type open but don't implement it).
- `AstromechConfig.admin?: { pages?: AppAdminPage[] }`.
- `ResolvedAppAdminPage = { path; label; icon?; translatable: boolean; fields: ResolvedEntryFields }`.
- `defineSettingsPage(page): AppAdminPage` identity helper exported from `src/index.ts`.

`path` is a slug (no leading slash). It is BOTH the route segment (`/admin/page/<path>`)
and the `settings` storage key. Reuse `toResolvedFields` + `validateFieldTree` from
`config-resolver.ts` on `fields`.

## Storage — `settings` table, one object per page

`settings` stays a dumb key/value primitive. A settings page persists its values as a
single object under its `path` key. Translatable pages add a per-locale companion key:

- `<path>`            → object of **shared** (non-translatable top-level) field values
- `<path>:<locale>`   → object of **translatable** top-level field values (one per locale)

Non-translatable page → just `<path>`.

Partitioning by top-level field translatable flag reuses the pure helper from 27a
(`src/core/globals-values.ts` — rename to `src/core/settings-page-values.ts`):
`partitionGlobalValues(fields, values) → { shared, perLocale }` and
`mergeGlobalValues(shared, perLocale)`. The ADMIN SAVE owns partitioning (it has the
schema): it calls `settings.set('<path>', shared)` and, when translatable,
`settings.set('<path>:<locale>', perLocale)`.

## `settings` SDK — locale-aware get

The only SDK change is a locale option on `settings.get`, kept schema-agnostic:

```ts
get(key: string, opts?: { locale?: string }): Promise<JsonValue | null>
```

Behavior: `locale = opts?.locale ?? config.defaultLocale`. Read `base = row[key]`. If a
`row['<key>:<locale>']` exists AND both are plain objects, return `{ ...base, ...loc }`;
otherwise return `base`. This makes `settings.get('globals')` (default locale) and
`settings.get('globals', { locale: 'fr' })` both "just work", and is a no-op for plain
scalar settings (no companion row). Implement in local + fetch SDK. No new SDK
namespace, no globals API route.

`settings.set` stays unchanged (dumb key→value); the page form writes the two keys.

## Permissions

No new permission. Viewing a settings page requires `settings:read`; saving requires
`settings:update` (both already exist). An `AppAdminPage.permission?` override may be
added later; not required now.

## Admin UI

- `AdminConfig.pages: ResolvedAppAdminPage[]` (or a record keyed by path) emitted from the
  admin-config virtual module builder (`src/adapters/astro.ts`), alongside `entries`.
- Sidebar: list app pages (label + icon) linking to `/admin/page/<path>`. Gate on
  `settings:read`. Place sensibly (its own group, or under the existing settings area).
- Route `src/admin/pages/_protected/page/$.tsx` (splat) — looks the page up in
  `adminConfig.pages` by path (empty-state if unknown), renders a Page with breadcrumb +
  title, then the field tree via the reusable `FieldTreeForm` (from 27a, keep it).
  - If `translatable`: a locale switcher (plain Select over `adminConfig.locales`,
    default `defaultLocale`) reloads values for the selected locale via
    `settings.get('<path>', { locale })`.
  - Save: partition with `partitionGlobalValues(fields, values)`, write `<path>` (shared)
    and, when translatable, `<path>:<locale>` (perLocale) via `settings.set`; toast +
    invalidate. Gate Save / read-only on `settings:update`.
- Add an admin hook (`src/admin/hooks/settings-pages.ts` or reuse settings hooks) for the
  load/save; match the existing hooks convention.

## Front-end read (later, 27d)

```ts
const g = await Astromech.settings.get('globals', { locale }); // → { siteName, logo, footerLinks }
```

## Rip-out of the abandoned globals core (do this first)

Revert all 27a "globals as a core concept" work, KEEPING only `FieldTreeForm` and the
partition helper (renamed):
- DELETE `src/sdk/local/globals.ts`, `src/api/routes/globals.ts`,
  `src/admin/pages/_protected/globals/$name.tsx`, `src/admin/hooks/globals.ts`,
  `src/core/config-resolver-globals.test.ts`, `src/core/type-generator-globals.test.ts`.
- `src/types/config.ts`: remove `GlobalConfig`/`ResolvedGlobalConfig`/`AdminGlobalConfig`
  and `globals` from `AstromechConfig`/`ResolvedConfig`/`AdminConfig`. ADD the
  `admin.pages` types above.
- `src/types/sdk.ts`: remove `AstromechGlobals`/`GlobalsNamespace`/`GlobalsApiEntry` and
  `globals` from `AstromechClient`. ADD the `opts?: { locale? }` arg to `SettingsApi.get`.
- `src/types/domain.ts`: remove `'globals:update'` from the `Permission` union.
- `src/core/config-resolver.ts`: remove `resolveGlobalConfig` + globals resolution. ADD
  `admin.pages` resolution.
- `src/core/type-generator.ts`: remove `generateGlobalsAugmentation` + its call.
- `src/sdk/local/index.ts`: remove the globals namespace; ADD locale merge to
  `settingsApi.get`.
- `src/sdk/fetch/index.ts`: remove the globals namespace; mirror the locale merge.
- `src/api/index.ts`: unmount the globals router.
- `src/adapters/astro.ts`: remove `toAdminGlobal`/globals emit; ADD `admin.pages` emit.
- `src/core/plugin-runtime.ts` (+ its test fixture): replace the `globals: {}` stub with
  whatever the new `ResolvedConfig` requires (e.g. no field, or `adminPages: []`).
- Rename `src/core/globals-values.ts` → `src/core/settings-page-values.ts`; update its
  test `globals-values.test.ts` import (keep the tests — still valid).

## Out of scope (27a)

Typed `settings.get` (stays `JsonValue`); custom-component app pages; per-sub-key
translation; menus (27b) and front-end wiring (27d/e).
