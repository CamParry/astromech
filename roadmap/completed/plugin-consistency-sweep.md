# Plugin consistency sweep

**Status:** done, 2026-07-29, on `feat/plugin-consistency-sweep`. Findings from
a five-plugin audit the same day (`main` at `7534fed`), against the convention
in `apps/docs/plugins/authoring.md`.

Landed as three commits — correctness, documentation truth, mechanical drift —
plus the backups service migration the `rawRoutes` decision pulled in. The
backups admin page was browser-verified against the demo on 4323: `listRuns`,
`triggerRun` and `deleteRun` all answer 200 over RPC, the download link still
streams a gzipped artifact (`content-type: application/gzip`), and an
unauthenticated probe of both gets 401.

The five: `@astromech/backups`, `@astromech/menus`, `@astromech/redirects`,
`@astromech/seo`, and the in-tree teaching plugin `apps/demo/src/plugins/rating`.
`rating` was updated most recently and is the reference — it produced no
findings.

Groups 1–3 below are one branch. The `definePermissions` work the audit also
triggered is **not** part of it — that is Phase 3 of
`roadmap/completed/plugin-authoring-experience.md`, lands separately, and
touches core.

## Compliance at time of audit

|                                 | backups             | menus                    | redirects       | seo                    | rating |
| ------------------------------- | ------------------- | ------------------------ | --------------- | ---------------------- | ------ |
| `definePlugin` one-object shape | ok                  | ok                       | ok              | ok                     | ok     |
| Thin `index.ts`                 | ok                  | inline pages + fields    | ok              | ok                     | ok     |
| Identity-unaware sub-modules    | table literal x3    | ok                       | ok              | `NAMESPACE` + queryKey | ok     |
| `permissions[]` declared        | ok                  | none                     | missing         | ok                     | ok     |
| Service methods complete        | n/a — no service    | no `mutates` / `summary` | ok              | ok                     | ok     |
| Settings read shape             | redundant `full`    | redundant `full`         | n/a             | ok                     | n/a    |
| README                          | missing             | missing                  | no layout table | actively wrong         | ok     |
| Namespace in comments/docs      | `astromech-backups` | ok                       | ok              | `astromech-seo` x3     | ok     |

## Group 1 — correctness

Real defects, not drift. Each is independent and needs no design.

- [x] **backups' database download is under-gated.**
      `packages/plugins/backups/src/routes/backups.ts:229-233` gates
      `GET /runs/:id/download` on `read`, whose own description is "List backup
      runs and artifact metadata". The `view` bundle is `['read']`, so a
      view-only role can pull the complete gzipped dump — every table, user
      records, password hashes, private settings. `restore` already has its own
      permission; download needs one too (or `restore`).
      **Fixed:** new `download` permission key, in the `manage` bundle only —
      `view` stays `['read']`, so a view-only role loses artifact access.
- [x] **`menus.get` is reported to the manifest as a mutation.**
      `packages/plugins/menus/src/service/menus.ts:97` omits `mutates` and
      `summary`. `codegen/method-manifest.ts:332` applies `mutates ?? true` as a
      deliberate fail-safe, so a public pure read ships to the manifest and MCP
      as mutating with `effectDeclared: false` — exactly the false positive the
      confirm gate exists to avoid. Fix the handler and the phantom typed stub
      at `menus/src/index.ts:30-33` together.
- [x] **The demo over-grants.** `apps/demo/astromech.config.ts:141` gives
      `content-editor` `backups.permissions('manage')` =
      `['read','run','restore','delete']`, so a content editor can restore and
      delete the database. Narrow it to `read`.

## Group 2 — documentation truth

- [x] **Stale `astromech-<x>` namespace strings.** The derivation strips the
      `@astromech/` scope, so the namespace is `backups` / `seo`. Wrong in
      `backups/src/routes/backups.ts:6-7`, `seo/src/pages/settings.ts:6`,
      `seo/README.md:55` and `seo/README.md:79`. Runtime code is correct
      everywhere — this is comment rot predating the scope-stripping rule.
- [x] **seo's README would not run as written.** It imports from
      `astromech/plugins/seo` (the package is `@astromech/seo`, per
      `package.json:2` and `apps/demo/astromech.config.ts:12`) and calls
      `seoPermissions('view')`, which **is not exported from anywhere** —
      `src/index.ts` exports only `seo`, `seoSection`, types and utilities.
      Canonical is reading the bundle off the factory. Note this section is
      rewritten again by Phase 3; fix it to today's truth now regardless.
      The same stale `astromech/plugins/*` specifier appears in
      `apps/docs/README.md:29`.
- [x] **`rawRoutes` is undocumented.** backups' entire API surface is
      `rawRoutes` and `authoring.md` never mentions the mechanism — its only
      guidance is "expose data through a service method". Streaming
      download/restore plausibly needs raw HTTP; `listRuns` / `triggerRun` /
      `deleteRun` return plain JSON and don't. **Decide:** document `rawRoutes`
      as a sanctioned surface (and its `routes/` directory, also absent from the
      documented file tree), or migrate the JSON endpoints to
      `defineServiceMethod`. Not a mechanical fix.
      **Decided: both.** `rawRoutes` is documented as sanctioned with its
      boundary stated (binary / multipart / streaming only, plus the warning
      that a raw route is invisible to the method manifest and so to the CLI and
      MCP). backups' three JSON endpoints then migrate to service methods to
      stop contradicting that boundary — tracked as its own item below, because
      it changes an API rather than a document.

- [x] **backups' JSON endpoints move to `defineServiceMethod`.** `listRuns`,
      `triggerRun` and `deleteRun` are plain JSON and belong on RPC; only
      `/runs/:id/download` and `/runs/:id/restore` stream and stay raw. This
      makes backups discoverable in the method manifest and lets its admin page
      drop the hand-rolled `pluginFetch` + `__ASTROMECH_API_ROUTE__` shim for
      the typed `service` off `useAstromechPlugin()`. Note the error channel
      changes: raw routes signal 409/404/410 by HTTP status, RPC returns the
      handler result, so the not-found / already-running / artifact-gone cases
      become result shapes the page branches on. Needs browser verification.

## Group 3 — mechanical drift

- [x] **Redundant `{ full: true }` on settings reads, with stale comments
      asserting the opposite.** `backups/src/backup.ts:186` and
      `menus/src/service/menus.ts:118` both pass `{ full: true }` and both carry
      a comment claiming settings are private-by-default. They aren't, at plugin
      altitude: 2d wrapped `ctx.settings` in
      `withDefaultSettingsShape(…, 'full')`
      (`plugins/runtime/plugin-runtime.ts:423`). `seo/src/service/seo.ts:44`
      omits the option and is the correct model. Drop both options and both
      comments. Keep the distinction in mind while editing: the raw
      `settingsApi.get` really does default `full` to `false`
      (`settings/service.ts:53`), so reading that function in isolation says the
      opposite of the truth inside a plugin. This misled two independent auditors
      and the main thread during the audit itself.

- [x] **backups re-derives its own table name.**
      `const TABLE = 'plugin_backups_runs' as const` appears in both
      `src/backup.ts:42` and `src/routes/backups.ts:19`, and the literal repeats
      a third time in the restore `preserve` list (`routes/backups.ts:174`).
      `backupRunsTable.name` already is that string.
- [x] **seo hardcodes its namespace in a renderer.**
      `src/admin/pages/overview-page.tsx:34` uses
      `queryKey: ['plugin', 'seo', 'overview']` without destructuring `plugin`
      from `useAstromechPlugin()`. `rating/admin/pages/overview-page.tsx:10` is
      the model.
- [x] **`SEO_PACKAGE` is unjustified.** The `<X>_PACKAGE` leaf exception exists
      only for `definePluginTable`'s literal type. seo has no tables — no
      `schema/`, no `migrations/`. Inline `package: '@astromech/seo'` in
      `index.ts` and delete the const (`src/types.ts:16`). `menus` is the model.
      seo's other hardcoded namespace (`NAMESPACE = 'seo'` in
      `fields/groups.ts:32`) is **not** in scope — it is the tracked Phase 3
      `seo.section()` remainder.
- [x] **menus' `index.ts` is not thin.** `menuItemFields` and the per-menu
      `pages` array are authored inline (`src/index.ts:20-26,45-61`). Extract to
      `pages/` and `fields/` modules, as the plugin already does for
      `service/menus.ts`.
- [x] **Missing READMEs.** `backups` and `menus` have none — and backups'
      `package.json:24-29` already lists `README.md` in `files`, so it ships a
      promise it doesn't keep. `redirects/README.md` lacks the layout tree and
      identity table that `rating/README.md` has.
- [x] **Packaging drift.** seo's `build` is `tsup && tsc` where the others are
      `tsup` alone. `astromech/columns` sits in menus' and seo's tsup externals
      and neither imports it. `seo/src/css.d.ts` is redundant — verified that
      `backups` typechecks its `.tsx` (confirmed present via `tsc --listFiles`)
      with a side-effect CSS import and no ambient declaration anywhere in the
      repo.
- [x] **CSS convention violations.** `font-size` values that aren't multiples of
      `0.25rem`: `seo/src/admin/pages/overview-page.css:41`,
      `seo/src/admin/fields/seo-preview-field.css:14,19`,
      `backups/src/admin/pages/backups-page.css:26`.

## Found while sweeping

- **`useAstromechPlugin()` gained `serviceKey`.** Building a raw-route URL from
  a plugin renderer was impossible without hardcoding identity: raw routes mount
  under the **service key**, the hook only exposed the **namespace**, and the
  namespace → service key derivation is lossy so it cannot be run backwards in
  the browser. The context already carried it; it is now returned
  (`admin/context/plugin.tsx`). backups' download link is the first consumer.
- **Open: the four plugin packages have no `lint` script.** Root `lint` covers
  `astromech` and `@astromech/schema-engine` only, so nothing lints
  `packages/plugins/*` — `typecheck` is their whole gate. Adding eslint to each
  is mechanical but will surface a backlog of its own, so it is deliberately not
  in this sweep.

## Noted, deliberately out of scope

- **`menus` declares no permissions at all.** Defensible: its only service
  method is `access: 'public'` and its admin pages are `fields`-only, which
  default to `settings:read`. But it means there is no way to grant "edit
  navigation menus" without granting generic `settings:read`, which also unlocks
  every other plugin's ungated settings page. A product decision, not a bug.
- **`menus`' `_menusServiceTyped` phantom stub** (`src/index.ts:28-40`) declares
  the service shape a second time because `buildMenusService` is a factory. Real
  drift risk, no clean fix identified.
- **Two O(n) scans.** `redirects.lookup` (`src/service/redirects.ts:25-28`)
  queries all redirects and `.find()`s per public request;
  `menus.resolveEntryRef` (`src/service/menus.ts:24-48`) scans every entry of
  every url-bearing type per node. Both are consequences of there being no
  reverse index yet — see `roadmap/completed/relationships-model.md`.
