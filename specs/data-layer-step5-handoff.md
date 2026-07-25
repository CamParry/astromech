# Step 5 handoff — definePlugin scoped factory, plugin-owned migrations, drizzle-orm removal

Implementation handoff for the coding agent. Design authority: `specs/data-layer.md` §"Step 5 — locked implementation decisions". This document is the execution plan — file paths, exact changes, gates. Work through sections in order (A→J); each builds on the last.

**Branch:** create a fresh `feat/data-layer-step5-plugin-factory` **from current `main`** — the old branch of that name held only this spec and was merged and deleted on 2026-07-25, and `main` now contains the `@astromech/schema-engine` extraction this step builds on. Verify with `git rev-parse --abbrev-ref HEAD` before every commit. Hooks stay ON — never `--no-verify`.

**Exit criterion:** `drizzle-orm` uninstalled from every package. It has exactly three remaining consumer groups: `entries/storage/table.ts` (tableStorage), the two plugin schemas (redirects, backups), and the better-auth Drizzle tables in `users/schema.ts` + `database/plugin-helpers.ts`. All die in this step.

## Context you must know before touching code

- Paths below are relative to `packages/astromech/src/` unless prefixed otherwise.
- `defineTable(name, ({col}) => ({...}), ({index}) => [...])` returns `TableDescriptor` (`database/define-table.ts`). Style template: `cron` / `relationships` descriptors in `database/schema.ts:85-126`.
- `CamelCasePlugin` translates **table identifiers too**: Kysely key for `plugin_backups_runs` is `pluginBackupsRuns`; leading-underscore names (`_astromech_*`) pass through untouched. Codec registry keys must match the Kysely key, not the SQL name.
- `generateMigrations({dir, tables, dialect, name})` now lives at **`database/generate.ts`** (same signature) — a thin Node-only wrapper that converts descriptors via `createSnapshot` and delegates to `@astromech/schema-engine/generate`. Reuse it **verbatim** for plugin generation. Never hand-write a generated migration; if output is wrong, fix the engine.
- **The migration engine is now the `@astromech/schema-engine` workspace package** (`packages/schema-engine`) — snapshot model, DDL renderers, differ, migration rendering, generation, apply, and the `dumpSchema` parity oracle. Step 5 must consume **only its public API**: `.` (pure, edge/D1-safe) and `./generate` (Node-only fs). Do not reach into its `src/`. The old CMS modules `database/{ddl,snapshot,diff,migration-render,generator,migrator}.ts` **no longer exist**; the CMS keeps `database/descriptor-snapshot.ts` (descriptor→snapshot conversion) and `database/generate.ts` (the wrapper above).
- Migration name prefixing happens **only** in the merged provider at apply time. Plugin migration files/journal entries keep bare `NNNN_<tag>` names.
- Empty-default type inference gotcha: `Record<never, never>` not `Record<string, never>`; self-referencing FK thunks need an explicit annotation (see existing descriptors for the pattern).
- Tests: `:memory:` dbs are poisoned after a storage transaction — use a per-test temp **file** db. `npm run test:run` skips tsc, so always run `npm run typecheck` too. Baseline test count: **883 passing** (50 in `@astromech/schema-engine` + 833 in `astromech`); root `test:run`/`typecheck`/`lint`/`build` all cover both workspaces now.
- `lint:deps` baseline: 9 errors + 5 circular warnings. Zero NEW ones allowed.
- Root build DTS can OOM — `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.
- Demo app loads the integration from dist/: core/plugin changes need root build + dev-server restart before browser/HTTP verification.

## A) `definePlugin` factory

NEW `database/define-plugin.ts`:

```ts
definePlugin<const T extends Record<string, TableDescriptor>>(opts: {
    alias: string;
    schema: (ctx: { table: PrefixedDefineTable }) => T;
}): T
```

- `table(name, cols, indexes?)` delegates to `defineTable` with the name rewritten to `plugin_<alias>_<name>`; the `cols`/`indexes` callbacks are passed through unchanged (`col` comes from the `defineTable` callback as usual — mirror `defineTable`'s exact callback signatures so authoring feels identical).
- Explicit index names get the same `plugin_<alias>_` prefix (namespacing — two plugins may both declare `idx_lookup`).
- Throw at define time if `name` already starts with `plugin_` (double-prefix guard) or if `alias` contains anything but `[a-z0-9-]`.
- Export a `PluginDB<T>` helper type mapping each descriptor to its Kysely table type (reuse `KyselyOf`/type machinery from `define-table.ts`) so plugins can type `getDb() as unknown as Kysely<PluginDB<typeof tables>>`.
- Re-export `definePlugin` (+ `PluginDB`) from `exports/plugin-kit.ts`.

## B) Codec — plugin descriptor registration

`database/codec.ts`:

- Add a mutable registry: `registerDescriptorCodec(kyselyKey: string, desc: TableDescriptor)` — `decode`/`encode`/`encodePatch` consult it after the static `DESCRIPTORS` map, before `LEGACY_CODECS`. Guard against double-registration with a differing descriptor (throw); same descriptor re-registration is a no-op (boot can run twice in dev).
- The kyselyKey is the CamelCasePlugin translation of the SQL name — add a small `kyselyTableKey(sqlName)` helper (snake→camel, leading underscore preserved) and use it at the registration call site.
- Export standalone helpers `decodeWith(desc, row)` / `encodeWith(desc, values)` / `encodePatchWith(desc, values)` (extract the existing descriptor-path bodies) so plugin code can decode rows without going through the string-keyed API. Re-export the three from `exports/plugin-kit.ts`.
- **Delete** the `plugin_backups_runs` entry from `LEGACY_CODECS` (the table moves to ISO-TEXT via its new descriptor). The comment block about redirect/backups plugin tables updates accordingly.
- Registration call site: `registerPlugins` (`plugins/runtime/plugin-runtime.ts:88`) — for every descriptor in each plugin's `schema`, `registerDescriptorCodec(kyselyTableKey(desc.name), desc)`.

## C) Manifest type changes

`types/plugins.ts` (`PluginDefinition`, lines ~207-266):

- `schema?: unknown[]` → `schema?: TableDescriptor[]` (import type from `@/database/define-table.js`), doc comment: "defineTable descriptors shipped by the plugin (create via `definePlugin`; names are `plugin_<alias>_` prefixed)".
- **Delete** `schemaModule` entirely (drizzle-kit aggregation is gone).
- Add `migrations?: MigrationProvider` (type import from `kysely`): "The plugin's own migration provider — `migrations/index.ts` generated by `astromech plugin:generate`. Merged into the app chain at apply time under `plugin_<alias>_`-prefixed names."

`plugins/runtime/plugin-schema.ts` — rewrite off Drizzle:

- `collectPluginSchemas` returns `{alias, tableName: desc.name, table: desc}` by iterating `def.schema` as `TableDescriptor[]` (shape check: `typeof t === 'object' && 'name' in t && 'columns' in t`).
- `assertPluginTablePrefixes` keeps identical semantics/message via `desc.name.startsWith(prefix)`.
- Header comment: descriptors, not Drizzle; delete the drizzle-kit/`schemaModule` paragraph.

## D) Merged migration provider + allowUnorderedMigrations

**`database/migrator.ts` no longer exists** — apply lives in the engine package (`packages/schema-engine/src/apply.ts`, exported as `migrateToLatest` from `@astromech/schema-engine`). Both features below are **generic engine concerns**, so implement them in the PACKAGE's `apply.ts` and re-export them to the CMS; do not reintroduce a CMS-side migrator module. Add package tests for both alongside the existing `packages/schema-engine/tests/apply.test.ts`.

In `packages/schema-engine/src/apply.ts`:

- `new Migrator({ db, provider, allowUnorderedMigrations: true })` — plugin migrations interleave with app history, single shared `kysely_migration` table. Expose it as an opt-in option on `migrateToLatest` rather than hard-coding it.
- NEW export:

```ts
mergeMigrationProviders(
    app: MigrationProvider,
    plugins: Array<{ alias: string; provider: MigrationProvider }>
): MigrationProvider
```

Returns a provider whose `getMigrations()` spreads the app's migrations under their own names and each plugin's under `plugin_<alias>_<name>`. Throw on any duplicate final key.

Wire BOTH apply paths (they must not drift):

- `transport/cli/commands/db-init.ts` — after `loadConfig`, collect `{alias, provider}` from `config.plugins` (resolve alias via `resolvePluginIdentity`; skip plugins without `migrations`), merge with the app's imported `migrationProvider`, pass to `migrateToLatest`.
- `kernel/boot.ts` `runMigrations(logger)` — change signature to `runMigrations(logger, plugins: PluginDefinition[])`; same merge. Update both call sites in `kernel/astro.ts:205,211` to pass `config.plugins ?? []`.

`mergeMigrationProviders` is engine-generic and goes in the package. The **collect** half is CMS-specific (it reads `PluginDefinition`s), so put `collectPluginMigrations(defs)` on the CMS side — a small module under `database/` that both apply paths import — and have it feed the package's `mergeMigrationProviders`. Careful with import boundaries: `kernel/boot.ts` must stay service-free (no `virtual:astromech/config` transitively) — the package import and `plugin-identity.ts` are both safe.

## E) `_astromech_plugins` tracking table — first REAL generated core migration

1. Descriptor in `database/schema.ts` (next to `cron`):

```ts
export const plugins = defineTable('_astromech_plugins', ({ col }) => ({
    alias: col.text({ primaryKey: true }),
    version: col.text({ notNull: true }),
    installedAt: col.timestamp({ notNull: true, defaultNow: true }),
}));
```

Append to `CORE_TABLES` (now 10; update the "9 descriptor-backed tables" comments here and in `codec.ts`). Add `PluginTrackingRow` types via `TableSelect`/`TableInsert`.

2. `database/types.ts`: add `_astromech_plugins: KyselyOf<typeof plugins>` to `DB` (leading underscore → key untranslated, same as `_astromech_cron`).
3. `database/codec.ts` static `DESCRIPTORS`: add `_astromech_plugins: plugins`.
4. Generate the migration FOR REAL: build first (CLI runs from dist — root `npm run build`), then `npm run db:generate -- --name plugins-tracking`. Expect `apps/demo/migrations/0001_plugins-tracking.ts` + updated `snapshot.json`/`journal.json`/`index.ts`. Inspect output; if wrong, fix the generator, delete artifacts, regenerate.
5. Boot upsert in `bootPlugins` (`plugins/runtime/plugin-runtime.ts:150`): per plugin, upsert `{alias, version, installedAt}` (insert or update `version` on conflict) into `_astromech_plugins`, wrapped in try/catch → `console.warn` (table may predate migration in odd dev states; boot must not die). After the loop, read all tracked aliases and `console.warn` for any tracked-but-unconfigured alias, mentioning `astromech plugin:purge <alias>`.

## F) CLI — `plugin:generate` and `plugin:purge`

NEW `transport/cli/commands/plugin-generate.ts`:

- **No `loadConfig`** — runs inside a plugin package with no app config.
- Args: `--schema` (default `./src/schema/index.ts`), `--name` (default `'migration'`), `--dir` (default `./migrations`).
- Load the schema module with `jiti` (same loader `transport/cli/config.ts` uses — reuse its jiti setup), take all top-level `TableDescriptor` exports (same shape check as §C).
- Validate: ≥1 descriptor; all share one `plugin_<alias>_` prefix (parse alias from the first, error listing offenders otherwise).
- Call the CMS wrapper `generateMigrations({dir: resolve(cwd, args.dir), tables, dialect: 'sqlite', name})` from `@/database/generate.js` (it takes descriptors and handles the snapshot conversion + warning printing); print same messages as `db:generate`. Do NOT call `@astromech/schema-engine/generate` directly — it takes a `Snapshot`, not descriptors.

NEW `transport/cli/commands/plugin-purge.ts`:

- Args: positional `alias`, `--config`. Loads config.
- Error if `alias` is still in `config.plugins` ("remove the plugin from your config first").
- In order: query `sqlite_master` for tables `LIKE 'plugin_<alias>_%'` and `DROP TABLE` each; `DELETE FROM kysely_migration WHERE name LIKE 'plugin_<alias>_%'`; `DELETE FROM _astromech_plugins WHERE alias = ?`. Print what was dropped/deleted.

Register both in `transport/cli/index.ts`. Update `db-generate.ts`'s header comment ("Plugin-owned tables are step 5's problem" → plugins generate their own via `plugin:generate`).

## G) tableStorage rewrite (descriptor + Kysely)

Rewrite `entries/storage/table.ts` preserving the EXACT `EntryStorage` semantics of the current implementation (read it first — reserved-column handling, search OR-LIKE across `searchFields` with throw-on-unknown-column, `where` eq/`{in}`/`{like}`, sort fallback to `createdAt` desc, `limit: 'all'`, pagination + count, transaction rebinding, `uniqueSlug` throws, `supports: []`):

- Signature: `tableStorage(table: TableDescriptor, options?: TableStorageOptions)` — options unchanged.
- Backend: shared Kysely via `getDb()` from `database/registry.js`, `as unknown as Kysely<Record<string, Record<string, unknown>>>` against the camelCase table key (`kyselyTableKey(table.name)`).
- Row mapping: `decodeWith(table, row)` on reads; `encodeWith`/`encodePatchWith` on writes. Column keys are the descriptor's camelCase keys (identical to the current Drizzle logical names — callers see no change).
- `create()`: stop hardcoding `crypto.randomUUID()` — let `encodeWith`'s appDefault path mint the id from the descriptor (`col.id()` → ULID). Timestamps likewise flow from descriptor defaults; `options.timestamps` continues to control which columns are managed/reported.
- `transaction()`: `db.transaction().execute(async (trx) => ...)`, rebinding a new instance on `trx`. `StorageDb` pass-through cast as before.
- Drop the `sql` re-export only if nothing imports it from here (grep first; keep if consumed).

## H) Port the two plugins, delete the Drizzle remnants

**redirects** (`packages/plugins/redirects/`):

- `src/schema/redirects.ts` → `definePlugin({alias: 'redirects', schema: ({table}) => ({redirects: table('redirects', ({col}) => ({...}))})})`; columns: `id: col.id()` (ULID — was randomUUID, fine: no live sites), `from`/`to` text notNull, `status` text notNull default `'301'`, `enabled` boolean notNull default true, `createdAt`/`updatedAt` timestamp notNull defaultNow (ISO-TEXT now). Export `redirectsTable` (the descriptor) + row types via `TableSelect`/`TableInsert`.
- `src/manifest.ts`: delete `SCHEMA_MODULE` + `TABLE_PREFIX` (alias is baked into `definePlugin`); fix header comment.
- `src/index.ts` plugin def: `schema: [redirectsTable]`, `migrations: migrationProvider` — static import from package-root `migrations/index.js` (relative import out of `src/` is fine — esbuild follows it; ensure `migrations/` is included in the published `files` if package.json lists one).
- `src/entries/redirect.ts`: `tableStorage(redirectsTable)` — descriptor now, same call shape.
- Generate the baseline FOR REAL: from the plugin dir run the built CLI `plugin:generate --name baseline` → `migrations/0000_baseline.ts` + snapshot/journal/index. Inspect; fix generator if wrong.

**backups** (`packages/plugins/backups/`): same schema/manifest/index conversion (`runs` table; `status`/`trigger` stay plain `col.text` with the union typed at the row-type level as today via a cast or `$type`-equivalent — descriptors have `col.enum` but DO NOT add a CHECK the old table didn't have unless trivially clean; prefer `col.enum` only if the generated DDL matches expectations). Timestamps → ISO-TEXT descriptors. Then:

- Delete the duplicated inline seconds-decoders at `src/backup.ts:53-58` and `src/routes/backups.ts:45-50`; both now `decodeWith(runsTable, raw)` (rows are ISO-TEXT + codec-registered, so plain `getDb()` reads need explicit decode as before — the helpers replace the hand math).
- `plugin:generate --name baseline` for its `migrations/`.

**Cleanup:**

- `apps/demo/migrations/0000_baseline.ts`: delete the two plugin-table sections (lines ~277-303) + the header-comment mention. Core `snapshot.json` never covered them — no snapshot change.
- `users/schema.ts`: the 4 better-auth Drizzle tables (`usersTable` etc.) — grep consumers; better-auth runs on its Kysely adapter, so if the only references are re-exports (`database/schema.ts:35-51`) and type derivations, delete the Drizzle tables and re-exports; keep/replace the `UserRow`-style types with hand-written interfaces if anything still imports them (the auth tables stay hand-authored in the app baseline and hand-typed in `database/types.ts` — unchanged).
- Delete `database/plugin-helpers.ts`; remove its export path from `packages/astromech/package.json` exports map (grep for `astromech/db` consumers first — none expected).
- Remove `drizzle-orm` from `packages/astromech/package.json`, `packages/plugins/redirects/package.json`, `packages/plugins/backups/package.json`; run `npm install` at root; fix any seed/script fallout (grep `drizzle` under `apps/demo`).

## I) Tests

- `packages/astromech/tests/storage/entries/table.test.ts`: convert the scratch table to a `defineTable` descriptor; behaviour assertions unchanged. Use a temp FILE db (not `:memory:`) — transaction tests poison memory dbs.
- NEW `tests/db/define-plugin.test.ts`: prefixing of table + index names, double-prefix throw, bad-alias throw, descriptor passthrough (columns intact).
- NEW `packages/schema-engine/tests/apply.test.ts` additions (engine-side, since §D puts the code there): merged `getMigrations()` key prefixing, duplicate-key throw, end-to-end `migrateToLatest` on a temp db with an app provider + a fake plugin provider + `allowUnorderedMigrations` (plugin migration sorts before the app's latest — must still apply). Package tests must not import from `astromech`.
- NEW `tests/db/merged-provider.test.ts` (CMS-side): `collectPluginMigrations` over `PluginDefinition`s — alias resolution, skipping plugins without `migrations`.
- NEW tracking/purge coverage: `bootPlugins` upserts a row; purge drops tables + migration rows + tracking row (drive the purge command's core logic — extract it to a function so it's testable without citty).
- `tests/db/drift.test.ts` + `baseline-ddl-parity.test.ts`: now expect 10 core tables; the chain applied in tests must be the MERGED provider (app + both first-party plugins) so sqlite_master parity covers plugin tables from their own baselines.
- Any harness that runs migrations must switch to the merged provider.

## J) Gates — run ALL, in this order, yourself

1. `npm run typecheck` (root — covers both workspaces)
2. `npm run lint` (root — covers both workspaces)
3. `npm run test:run` (root — both suites) — **883 baseline** + new tests, zero failures
4. `npm run lint:deps` — zero NEW vs baseline (9 errors + 5 circular warnings)
5. `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (root)
6. Fresh db: delete the demo db file, `npm run db:init -w astromech-demo` (or root equiv), seed, then `npm run db:generate` → must print no-changes; `plugin:generate` in both plugin dirs → no-changes; sqlite check: all 10 core + 4 auth + 2 plugin tables present, `kysely_migration` holds app names + `plugin_redirects_0000_baseline` + `plugin_backups_0000_baseline`, `_astromech_plugins` has both aliases.
7. Demo smoke: start dev server (port 4323), HTTP 200 on `/admin` login page + one API route; verify a redirects admin list read and a backups run list read (exercises tableStorage + codec paths).
8. `grep -ri "drizzle" packages/astromech/src packages/plugins apps/demo/src` → zero hits; `grep -rn "drizzle" */package.json packages/*/package.json packages/plugins/*/package.json` → zero hits; `package-lock.json` no longer contains `drizzle-orm`.

Commit (on `feat/data-layer-step5-plugin-factory`, HEAD verified in the same command block):

```
feat(data-layer): step 5 — definePlugin scoped factory, plugin-owned migrations, drizzle-orm removal
```

Do NOT push, do NOT merge to main, do NOT touch `roadmap/` — the main thread handles those after review.
