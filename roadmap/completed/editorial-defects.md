---
milestone: 1.0
---

# Editorial defects

Found on 2026-10-03 while planning `roadmap/planned/drafts.md`.

- **The redirects plugin records a redirect for any slug change.** Its
  `entry:afterUpdate` hook (`packages/plugins/redirects/src/hooks/slug-change.ts`)
  checks neither status nor staging, so renaming an unpublished entry, or a
  staged change, records a 301 from a path that was never live. With autosave,
  every half-typed slug would become one.
- **The redirects plugin records the wrong path in other locales.** It builds
  `from` from the `url` template alone (`resolveEntryPath` in
  `packages/astromech/src/entries/entry-url.ts`), with no locale prefix, so a
  slug change in a non-default locale redirects from a path that never
  existed. `roadmap/planned/ordered-and-nested-entries.md` replaces the hook
  with a path-change event that carries the locale.
- **Setting a status through `update` needs only `update`.** `schedule` and
  `unpublish` need `publish`, but `update` with `status: 'scheduled'` or
  `'unpublished'` passes with `update`
  (`packages/astromech/src/entries/internal/access.ts`).
- **Globals publish with `update` alone.** `globals.update` accepts `status`
  and `publishedAt` (`packages/astromech/src/globals/schema.ts`) and checks
  only `update` (`packages/astromech/src/globals/methods/update.ts`); the tests
  cover only the dedicated status routes.
- **The admin ignores `publish`.** The status select offers every status to
  everyone (`packages/admin/src/components/entries/publish-panel.tsx`), the
  new-entry page always shows Publish, and every save sends `status`, so a user
  without `publish` gets a 403 saving a published entry.
- **`maxVersions` is never applied**, and **a staged write takes a version that
  is deleted when the staged change is merged or discarded**. Both are fixed by
  `roadmap/planned/history.md`; listed here so they are not fixed twice.

The class: a side effect or a permission tied to the write rather than to what
became live.

## The work

- [x] The redirects plugin records a redirect only when a published entry's
      live slug changes; a staged merge counts as a write to the live row.
      Recording it on publish instead belongs to `roadmap/planned/drafts.md`.
- [x] Redirect paths include the locale prefix.
- [x] A status in `update` needs `publish`, as the status methods do, for
      entries and globals.
- [x] The admin offers status changes and Publish only with `publish`.
- [x] Tests for both.

## Left open

- **Plugins write statuses on trusted handles.** A plugin context's
  `ctx.entries` and `ctx.globals` are trusted (`createPluginContext`,
  `packages/astromech/src/plugins/runtime/plugin-runtime.ts`), so a plugin
  method or route acting for a user without `publish` could write a status. No
  plugin does today.
- **Scheduling a published row keeps its past date.** An update naming
  `status: 'scheduled'` and no `publishedAt` on a published row keeps the row's
  date (`packages/astromech/src/content/published-at.ts`), so the row becomes
  scheduled for a time already passed and the next `scheduled-publish` run
  republishes it. The admin does the same through the form: picking Scheduled
  on a published row shows the row's past date pre-filled (`toFormValues` in
  `packages/admin/src/hooks/use-edit-controller.ts`), and `buildPayload`
  (`packages/admin/src/hooks/use-entry-form.ts`) sends it with the status.
- **Locale paths assume Astro's default routing.** `resolveEntryLocalePath`
  and `resolveEntryLocaleUrl` (`packages/astromech/src/entries/entry-url.ts`)
  leave the default content locale unprefixed and put every other locale
  under `/{locale}` (`DECISIONS.md`, "A locale's public path"). They give the
  wrong path when Astro's `i18n.defaultLocale` differs from Astromech's default
  content locale, with `prefixDefaultLocale: true`, with `routing: 'manual'`,
  and with `domains`. The Astro integration already reads Astro's config in
  `astro:config:done` (`packages/astromech/src/integrations/astro/integration.ts`,
  where it reads `security.allowedDomains`); a warning there when Astro's
  `i18n.defaultLocale` differs from Astromech's default content locale, or
  `prefixDefaultLocale` is true, would catch the setups this rule gets wrong.
- **Turning `statuses` off on an existing type makes its unpublished rows
  public.** A type without statuses stores `unpublished` on every row and
  treats every row as live (`isPubliclyVisible` in
  `packages/astromech/src/content/visibility.ts`), so rows that were
  unpublished or scheduled before the change appear in public reads. Not
  decided: a boot warning cannot tell those rows from rows written after the
  change, since both store `unpublished`, and a config change runs no data
  migration. One way is to store `published` on a statuses-off type's rows, so
  a remaining `unpublished` or `scheduled` row marks one written with statuses
  on, and warn at boot or in a site-health check
  (`roadmap/planned/site-health.md`) when one exists.
- **Two consumers still build locale URLs without the prefix.** The menus
  plugin resolves an entry link with `resolveEntryUrl`
  (`packages/plugins/menus/src/service/menus.ts`), and the seo plugin's
  sitemap lists each entry with `resolveEntryPath`
  (`packages/plugins/seo/src/service/seo.ts`). The demo's sitemap
  (`apps/demo/src/pages/sitemap.xml.ts`) then adds a prefixed copy of every
  URL for every locale, including locales the entry has no row in.
