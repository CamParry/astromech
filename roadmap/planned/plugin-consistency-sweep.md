# Plugin consistency sweep

**Status:** planned. Findings from a five-plugin audit on 2026-07-29 (`main` at
`7534fed`), against the convention in `apps/docs/plugins/authoring.md`.

The five: `@astromech/backups`, `@astromech/menus`, `@astromech/redirects`,
`@astromech/seo`, and the in-tree teaching plugin `apps/demo/src/plugins/rating`.
`rating` was updated most recently and is the reference — it produced no
findings.

Groups 1–3 below are one branch. The `definePermissions` work the audit also
triggered is **not** part of it — that is Phase 3 of
`roadmap/in-progress/plugin-authoring-experience.md`, lands separately, and
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

- [ ] **backups' database download is under-gated.**
      `packages/plugins/backups/src/routes/backups.ts:229-233` gates
      `GET /runs/:id/download` on `read`, whose own description is "List backup
      runs and artifact metadata". The `view` bundle is `['read']`, so a
      view-only role can pull the complete gzipped dump — every table, user
      records, password hashes, private settings. `restore` already has its own
      permission; download needs one too (or `restore`).
- [ ] **`menus.get` is reported to the manifest as a mutation.**
      `packages/plugins/menus/src/service/menus.ts:97` omits `mutates` and
      `summary`. `codegen/method-manifest.ts:332` applies `mutates ?? true` as a
      deliberate fail-safe, so a public pure read ships to the manifest and MCP
      as mutating with `effectDeclared: false` — exactly the false positive the
      confirm gate exists to avoid. Fix the handler and the phantom typed stub
      at `menus/src/index.ts:30-33` together.
- [ ] **The demo over-grants.** `apps/demo/astromech.config.ts:141` gives
      `content-editor` `backups.permissions('manage')` =
      `['read','run','restore','delete']`, so a content editor can restore and
      delete the database. Narrow it to `read`.

## Group 2 — documentation truth

- [ ] **Stale `astromech-<x>` namespace strings.** The derivation strips the
      `@astromech/` scope, so the namespace is `backups` / `seo`. Wrong in
      `backups/src/routes/backups.ts:6-7`, `seo/src/pages/settings.ts:6`,
      `seo/README.md:55` and `seo/README.md:79`. Runtime code is correct
      everywhere — this is comment rot predating the scope-stripping rule.
- [ ] **seo's README would not run as written.** It imports from
      `astromech/plugins/seo` (the package is `@astromech/seo`, per
      `package.json:2` and `apps/demo/astromech.config.ts:12`) and calls
      `seoPermissions('view')`, which **is not exported from anywhere** —
      `src/index.ts` exports only `seo`, `seoSection`, types and utilities.
      Canonical is reading the bundle off the factory. Note this section is
      rewritten again by Phase 3; fix it to today's truth now regardless.
      The same stale `astromech/plugins/*` specifier appears in
      `apps/docs/README.md:29`.
- [ ] **`rawRoutes` is undocumented.** backups' entire API surface is
      `rawRoutes` and `authoring.md` never mentions the mechanism — its only
      guidance is "expose data through a service method". Streaming
      download/restore plausibly needs raw HTTP; `listRuns` / `triggerRun` /
      `deleteRun` return plain JSON and don't. **Decide:** document `rawRoutes`
      as a sanctioned surface (and its `routes/` directory, also absent from the
      documented file tree), or migrate the JSON endpoints to
      `defineServiceMethod`. Not a mechanical fix.

## Group 3 — mechanical drift

- [ ] **Redundant `{ full: true }` on settings reads, with stale comments
      asserting the opposite.** `backups/src/backup.ts:186` and
      `menus/src/service/menus.ts:118` both pass `{ full: true }` and both carry
      a comment claiming settings are private-by-default. They aren't, at plugin
      altitude: 2d wrapped `ctx.settings` in
      `withDefaultSettingsShape(…, 'full')`
      (`plugins/runtime/plugin-runtime.ts:423`). `seo/src/service/seo.ts:44`
      omits the option and is the correct model. Drop both options and both
      comments.

          Keep the distinction in mind while editing: the raw `settingsApi.get`
          really does default `full` to `false` (`settings/service.ts:53`), so
          reading that function in isolation says the opposite of the truth inside a
          plugin. This misled two independent auditors and the main thread during
          the audit itself.

- [ ] **backups re-derives its own table name.**
      `const TABLE = 'plugin_backups_runs' as const` appears in both
      `src/backup.ts:42` and `src/routes/backups.ts:19`, and the literal repeats
      a third time in the restore `preserve` list (`routes/backups.ts:174`).
      `backupRunsTable.name` already is that string.
- [ ] **seo hardcodes its namespace in a renderer.**
      `src/admin/pages/overview-page.tsx:34` uses
      `queryKey: ['plugin', 'seo', 'overview']` without destructuring `plugin`
      from `useAstromechPlugin()`. `rating/admin/pages/overview-page.tsx:10` is
      the model.
- [ ] **`SEO_PACKAGE` is unjustified.** The `<X>_PACKAGE` leaf exception exists
      only for `definePluginTable`'s literal type. seo has no tables — no
      `schema/`, no `migrations/`. Inline `package: '@astromech/seo'` in
      `index.ts` and delete the const (`src/types.ts:16`). `menus` is the model.
      seo's other hardcoded namespace (`NAMESPACE = 'seo'` in
      `fields/groups.ts:32`) is **not** in scope — it is the tracked Phase 3
      `seo.section()` remainder.
- [ ] **menus' `index.ts` is not thin.** `menuItemFields` and the per-menu
      `pages` array are authored inline (`src/index.ts:20-26,45-61`). Extract to
      `pages/` and `fields/` modules, as the plugin already does for
      `service/menus.ts`.
- [ ] **Missing READMEs.** `backups` and `menus` have none — and backups'
      `package.json:24-29` already lists `README.md` in `files`, so it ships a
      promise it doesn't keep. `redirects/README.md` lacks the layout tree and
      identity table that `rating/README.md` has.
- [ ] **Packaging drift.** seo's `build` is `tsup && tsc` where the others are
      `tsup` alone. `astromech/columns` sits in menus' and seo's tsup externals
      and neither imports it. `seo/src/css.d.ts` is redundant — verified that
      `backups` typechecks its `.tsx` (confirmed present via `tsc --listFiles`)
      with a side-effect CSS import and no ambient declaration anywhere in the
      repo.
- [ ] **CSS convention violations.** `font-size` values that aren't multiples of
      `0.25rem`: `seo/src/admin/pages/overview-page.css:41`,
      `seo/src/admin/fields/seo-preview-field.css:14,19`,
      `backups/src/admin/pages/backups-page.css:26`.

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
  reverse index yet — see `roadmap/planned/relationships-model.md`.
