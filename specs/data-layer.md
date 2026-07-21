# Data Layer — `defineTable`, homegrown migrations, Kysely storage

**Status:** Design locked for the authoring surface (column/table API, references, reads/writes); migration-generator internals still being refined. Implementation not started.
**Supersedes:** the data-layer parts of `project_data_layer_architecture` memory + `/tmp/astromech-data-layer-handoff.md` + `/tmp/astromech-definetable-handoff.md` (this is the consolidated, current source of truth).
**Touches:** `packages/astromech/src/database/**`, every `*/storage/*.ts`, `media/service.ts`, `cron/runner.ts`, `transport/cli/commands/db-*.ts`, `apps/demo/drizzle/**`, plugin schema files under `packages/plugins/*`.
**Related roadmap:** `planned/table-definition-system.md` (Feature 1 — active), `planned/data-layer-storage-api.md` (Feature 2 — shelved), `planned/additional-database-drivers.md` (Postgres adapter slots in), `in-progress/populate-and-complex-field-data-model.md` (populate consumes `reference`), `in-progress/entries-module-reshape.md` (storage pattern this builds on).
**Related memories:** `project_data_layer_architecture`, `project_modular_architecture`, `project_entries_reshape`, `app-owned migrations`, `drizzle migration ordering`, `test tx :memory: poison`, `domain barrel browser boundary`.

> Specs are ephemeral (in-flight designs only). Delete this once the work ships; don't link to it from durable docs/code.

---

## 0. What this is

Replace Drizzle ORM with a homegrown schema toolkit + thin row codec over **Kysely**. We are NOT building an ORM (no query DSL hiding SQL, no lazy relations, no identity map, no auto eager-load). Raw Kysely stays the query layer. We own a `defineTable` descriptor, a homegrown migration generator, a per-column runtime codec, and an ergonomic storage wrapper.

**Why homegrown migrations:** we own _both_ sides of the diff as typed descriptor objects over a _closed_ column vocabulary, so the genuinely-hard part of every off-the-shelf tool (parsing/normalising foreign SQL/HCL) doesn't apply. Atlas paywalls the hard part (`migrate lint`/destructive detection); Prisma needs its DSL as desired-state; Kysely has no generator. So: build our own state-based generator (snapshot + diff → DDL).

**Why Kysely:** pure-SQL query builder, edge/D1-safe at runtime, type-driven by a `DB` interface (no codegen), dialect-pluggable (SQLite first, Postgres slots in).

---

## 1. Feature split (scoping)

The whole thing is too big for one chunk. Split into two features, build Feature 1 first.

### Feature 1 — Table definition system (ACTIVE)

`defineTable` + `col` factory + runtime codec + type inference (Select/Insert/Update **+ the Kysely `DB` interface**) + dialect seam + homegrown migration generator (snapshot/diff/DDL/SQLite-rebuild) + CLI repoint (`db:generate`/`db:init`) + drift gate + scoped plugin factory. Everything that turns descriptors into **schema, types, and migrations**. Includes the Drizzle→Kysely runtime swap (below) — otherwise the app is stranded.

### Feature 2 — Data-layer storage API (SHELVED — see `roadmap/planned/data-layer-storage-api.md`)

The ergonomic `createXStorage` surface layered on the working Kysely base: `findOne`/`findMany`/`query`/`create`/`update`/`delete`/`updateMany`/`deleteMany`/`upsert`, the flat `where` DSL, and `reference` populate. Plus relationships (already deferred — see §8).

The §5 read/write API and §4 `where` DSL below are **Feature 2** decisions, recorded here so they aren't lost.

---

## 2. Feature 1 implementation sequence

Strictly ordered; each step stays independently green.

1. **One-for-one Drizzle→Kysely.** Hand-write the Kysely `DB` interface, rewrite storage queries to Kysely, behind unchanged `createXStorage(db = getDb())` signatures. Drop `drizzle-kit` + the `apps/demo/drizzle` journal; hand-author **one Kysely baseline migration** (raw `CREATE TABLE`s mirroring today's schema) applied via Kysely's `Migrator`. Throwaway — replaced in step 4. Pre-production, so dev/CI just reseed. **→ see the dedicated step-1 handoff doc.**
2. **Table definitions.** `defineTable` + `col` + codec + inference; the `DB` interface now _derives_ from descriptors instead of being hand-written.
3. **Generated artefacts off descriptors.** DDL emit, `snapshot.json`, admin metadata.
4. **Migration diffing.** snapshot/diff/DDL + SQLite-rebuild generator, CLI repoint, drift gate. The generator regenerates the baseline from descriptors; drift gate proves parity; delete the hand-written baseline.

### Step 1 — locked implementation decisions (resolved 2026-06-25)

Grilled and confirmed against the real codebase; the implementation handoff (`/tmp/astromech-step1-impl-handoff.md`) carries the full detail. The non-obvious calls:

- **Timestamps are unix-SECONDS, not ms.** The step-1 codec must encode `Math.floor(getTime()/1000)` and decode `value*1000`; where-clause date comparisons convert `Date → Math.floor(getTime()/1000)`. (The original /tmp handoff said ms — wrong.)
- **`CamelCasePlugin` on our Kysely instance.** DDL columns are snake_case; every consumer expects camelCase rows. The plugin maps both ways, so the `DB` interface + codec keys stay camelCase.
- **Keep the drizzle `*Table` objects** (do NOT delete them in step 1). Seed scripts, `tableStorage` introspection, and plugin authoring still import them, and `$inferSelect`/`$inferInsert` stay the domain Row types (zero consumer churn). Only runtime _queries_ move to Kysely + codec. Step 2 deletes the table objects when `defineTable` replaces them.
- **better-auth → its built-in Kysely adapter** (`better-auth@1.5.5`, `database: { dialect: new LibsqlDialect({ client }), type: 'sqlite' }`), mapping to our plural table names + snake_case columns via `modelName`/`fields`. It gets its OWN plugin-free Kysely/dialect over a **shared `@libsql/client` `Client`** (so its snake_case field mappings don't collide with `CamelCasePlugin`, and `:memory:` stays one connection). On-disk auth format unchanged (seconds INTEGER / 0-1) — **verify login + signup in the browser**.
- **The registry holds the shared `client`** alongside the Kysely db (`setDbClient`/`getDbClient`), used by better-auth and by the libsql driver's `dump`/`restore`.
- **Plugins WILL be touched** (the surface is small): the **backups** plugin (`backup.ts`, `routes/backups.ts`) does direct drizzle queries on `ctx.db` → port to Kysely. **redirects** is pure `tableStorage` (no change). **seo/menus/rating** touch no DB. `ctx.db` (`CronContext.db`, `PluginContext.db`) becomes `Kysely<DB>`. Keep plugin drizzle schema objects (`backupRunsTable`, `redirectsTable`).
- **Codec has two write paths:** `encode` (INSERT — injects app defaults id/now) and `encodePatch` (UPDATE — strips `undefined`, injects nothing, so `createdAt` is never clobbered on update).

### Step 2 — locked implementation decisions (resolved 2026-06-25)

Full build plan in `/tmp/astromech-step2-definetable-handoff.md`. The non-obvious calls:

- **Three table tiers — `defineTable` lands for OUR 9 only.** `roles, entries, entry_versions, entry_preview_tokens, media, settings, notifications, relationships, _astromech_cron` get `defineTable` + the format flip. The **4 better-auth tables** (`users, sessions, accounts, verifications`) stay **seconds-INTEGER + hand-typed** — better-auth writes them through its own adapter in that format; flipping breaks login. **Plugin tables** (`plugin_redirects_redirects` via Drizzle tableStorage, `plugin_backups_runs` via Kysely+codec) stay Drizzle/legacy until step 5. (`roles` is ours — RBAC, not a better-auth model — so it's tier-1.)
- **Bundle the ISO-TEXT + ULID flip into step 2** (user-chosen). `defineTable` is built ISO-native (no legacy timestamp mode in the new permanent code); the 9 tables cut over + reseed. Data migration is just a reseed (pre-production). Mixed format across tiers is fine — the boundary is clean ownership, and the auth tables were always going to be seconds.
- **Baseline stays hand-authored in step 2.** Descriptors drive **types + codec** only; `baseline.ts` is hand-edited (the 9 tables' timestamps `integer`→`text`). DDL-emit-from-descriptors is step 3; the drift gate (step 4) reconciles the temporary two-source overlap.
- **Codec stays one module, two paths:** descriptor-driven for the 9; a retained legacy seconds map for the 4 auth tables + `plugin_backups_runs`. `decode`/`encode`/`encodePatch` signatures unchanged (storage calls them everywhere).
- **Type-inference output contract is fixed** (spelling is the agent's latitude): (a) a Kysely table type per descriptor for `DB`, (b) `Select`/`Insert`/`Update` row types matching today's domain shapes (Date/parsed-object/boolean/string-id) so downstream storage has **zero churn**. `Insert` optionality = generated (id/defaultNow/app-default) ∨ SQL-default ∨ nullable.
- **`reference` accepts `TableDescriptor | (() => TableDescriptor) | string`** — thunk for self-references (`entries.stagedFor → entries`), string/external-stub for hand-typed auth targets (`createdBy → users`). FK intra-scope (both in core `DB`); `staged_for` is **NO ACTION** (matches the real DB, not the original handoff's CASCADE guess).
- **ULID via `ulidx`** (maintained TS/ESM). Id columns are already TEXT → ULID is generation-only, no DDL change; only timestamps change shape.
- **Where-clause date literals flip to `toISOString()`** for tier-1 tables (ISO is fixed-width → lexicographic compare works). Audit `entries/storage/maintenance.ts`, `preview-tokens.ts`, `cron/runner.ts` (cron is tier-1).
- **Delete core Drizzle `*Table` objects for the 9** (keep auth + plugin objects); repoint seed scripts to Kysely+codec; `$inferSelect` row types become `TableSelect<typeof x>` keeping the same export names.

### Step 4 — locked implementation decisions (resolved 2026-07-11)

Locks open specifics #4, #5, #6, #8, #11.

**#4 Journal/snapshot format** — app-owned `apps/demo/migrations/` (rename the misleading `drizzle/` dir; delete the dead drizzle-kit `*.sql` + `meta/`):

- `journal.json` — `{ version, dialect, entries: [{ idx, tag, when }] }`. Ordering is by `idx` ALONE (`when` informational — drizzle-kit's silent non-ascending-`when` skip bug must not be reproducible).
- `snapshot.json` — ONE latest snapshot (what the next generate diffs against). No per-migration snapshot history (that existed for drizzle's rename-resolver, which we deleted). No `id`/`prevId` hash chain — divergent parallel generates surface as a `snapshot.json` merge conflict + the CI no-new-migration gate.
- Migrations are **TS, not .sql**: `NNNN_<tag>.ts` exporting `up(db)` with raw `` sql`…` `` statements (baseline's existing style) — one file shape for generated schema migrations AND hand-authored data migrations. Generated `index.ts` statically imports all and exports the `MigrationProvider` (Workers-safe, spec #9). **No `down()`** — forward-only.
- **Baseline is not 100% descriptor-generated:** the 4 better-auth + 2 plugin tables have no descriptors; `0000_baseline.ts` keeps a hand-authored "foreign tables" section the generator passes through untouched (descriptors own only the 9; DDL-only auth descriptors rejected — second source of truth better-auth doesn't honour).

**#5 SQLite rebuild details:**

- **Fast-path** (native SQLite DDL) ONLY for: `CREATE TABLE` (new), `DROP TABLE`, `ALTER TABLE ADD COLUMN` (nullable or NOT NULL+literal-default), `CREATE INDEX`/`DROP INDEX`. **Everything else rebuilds** (column drop/retype/nullability/default/enum-CHECK change, FK change, PK change). SQLite 3.35 `DROP COLUMN` deliberately unused — fails on indexed/CHECKed columns.
- **No self-managed tx**: Kysely `Migrator` already wraps each migration in a transaction. Rebuild = `PRAGMA defer_foreign_keys = true` (tx-scoped, auto-resets) → `CREATE __new_<table>` → `INSERT INTO __new_<table> (…) SELECT … FROM <table>` → `DROP TABLE` → `RENAME TO` → recreate ALL of the table's indexes from the new snapshot.
- **Column mapping**: intersection of old/new matched by snake_case name; dropped omitted; added rely on `DEFAULT`. nullable→NOT NULL with literal default copies as `COALESCE(col, <default>)` (backfills NULLs).
- **Triggers/views unmanaged**, documented as such.

**#6 Validation rules** — hard ERRORS (guaranteed fail/nonsense): add NOT NULL column w/o SQL-literal default to an EXISTING table (new tables exempt); flip existing column to NOT NULL w/o literal default; index naming an unknown column; duplicate index name across schema. (No FK-target-exists check: descriptor targets exist by construction; string targets are trusted foreign tables, e.g. `users`.) Loud WARNINGS (data-dependent, generate proceeds): drop table/column; enum narrowed (CHECK may reject rows); new/changed unique index on existing table; column type change (SQLite copies as-is).

**#8 CLI repoint** — `db:generate`: load config → build snapshot from core descriptors → diff vs `migrations/snapshot.json` → write `NNNN_<tag>.ts` (`--name` arg, default `migration`) + regenerate `index.ts` + update snapshot/journal; no-op prints "no changes". `db:init`: import `<cwd>/migrations/index.ts` provider → Kysely `Migrator` (replaces hard-coded `drizzle/baseline.ts`).

**#11 Drift gate** — (a) parity test generalised: DB built via full migration chain vs DB built from `emitTableStatements()` per descriptor → identical `sqlite_master` for the 9; (b) "generate produces no new migration" as a vitest test (diff of current descriptors vs committed snapshot = zero ops) so CI gets it for free.

### Step 5 — locked implementation decisions (resolved 2026-07-12)

Locks open specifics #9 (descriptor discovery) and #10 (scoped plugin factory). Exit criterion: **`drizzle-orm` uninstalled** — which forces the descriptor-driven `tableStorage` replacement into scope (it is the last Drizzle consumer).

**#10 `definePlugin` factory** — `definePlugin({ alias, schema: ({ table, col }) => ({ ...tables }) })`:

- Alias-bound `table` = `defineTable` auto-prefixing `plugin_<alias>_<name>`; `col` identical to core's. Manual `TABLE_PREFIX` plumbing dies.
- Plugin manifest `schema` becomes `TableDescriptor[]`; `schemaModule` (the drizzle-kit aggregator hook) is deleted.
- Type story same as core (§7): one descriptor → plugin Row types + plugin-scoped Kysely cells; core tables type-unaddressable from the plugin's `db`.

**Migration composition — ONE shared migration table** (not per-plugin migrator state):

- Single Kysely `Migrator` run over a MERGED provider: app chain (`<cwd>/migrations/index.ts`) + each configured plugin's provider (exposed on its manifest as a static import of the plugin package's own `migrations/index.ts`).
- Plugin migration NAMES are prefixed `plugin_<alias>_` in the merged provider (e.g. `plugin_redirects_0000_baseline`); core names stay bare `NNNN_<tag>`. File names inside each package stay `NNNN_<tag>.ts`.
- `allowUnorderedMigrations: true` — a plugin/core update legitimately appends names sorting before already-applied ones; within-prefix order stays strict (journal `idx`), cross-prefix order is irrelevant (namespaced tables).
- **No back-compat shim**: the app baseline's hand-authored 2 plugin-table sections move into each plugin's own `0000_baseline`; no sites exist, demo DB reseeds. (The 4 better-auth tables REMAIN hand-authored in the app baseline — unchanged from #4.)

**#9 Discovery — static imports everywhere** (Workers bundler; no fs scanning at runtime): plugin package ships `migrations/` (+ `snapshot.json` + `journal.json`) at package root; its generated `index.ts` provider is statically imported by the plugin's entry and exposed via manifest. Site config → manifests → merged provider at boot/`db:init`. Generation stays dev/CI-only Node.

**`plugin:generate` CLI** — run inside the plugin package (an app config must not be needed): loads the plugin's schema module — default `./src/schema/index.ts`, `--schema` override — exporting the `definePlugin` result (or `TableDescriptor[]`), diffs against the package's own `migrations/snapshot.json`, writes into `./migrations`. Reuses `database/generator.ts` verbatim; prefixing happens in the provider, not in tags/filenames.

**Installed-plugin tracking + `plugin:purge`** — new core table `_astromech_plugins` (alias TEXT PK, version, installedAt) upserted lazily at boot. Its descriptor is the 10th core table → lands as the core chain's first REAL generated migration (exercises the step-4 generator end-to-end). Boot warns when a tracked alias is absent from config (leave-on-remove). `plugin:purge <alias>`: drop all `plugin_<alias>_*` tables, delete its rows from the shared migration table (`name LIKE 'plugin_<alias>_%'`), delete the tracking row.

**tableStorage replacement** — `entries/storage/table.ts` re-implemented over a `TableDescriptor` + the shared Kysely instance (options/API surface unchanged). The descriptor's explicit key→name mapping + per-column codec fixes both step-1 regressions that forced the Drizzle revert (CamelCasePlugin name mangling, lost per-column mode decode). Legacy seconds codec map for `plugin_backups_runs` dies — plugin descriptors make it ISO-TEXT like all descriptor tables (data reseeds).

---

## 3. Authoring API — LOCKED (Q1–Q4)

### Q1 — Options-object `col` factory in a callback (not chained)

`defineTable(name, ({ col }) => ({ ...columns }))`. Object-syntax options per column, NOT Drizzle-style chaining. Rationale: chaining appears nowhere else in the authoring layer (it was the one Drizzle exception we're deleting); the dominant convention is options-object with `const`-generic inference (`definePermissionBundles<const B>`, `defineHook`). Equal inference power, far less owned type-machinery, convention-consistent. We leave Drizzle muscle-memory behind deliberately.

The callback is the single authoring surface: core calls it with a global-scoped factory; a plugin gets the identical signature with an **alias-bound** factory that auto-prefixes (§7).

### Q4 — Column vocabulary

| Kind                           | Storage                                | Options                                |
| ------------------------------ | -------------------------------------- | -------------------------------------- |
| `col.id()`                     | ULID text PK, app-generated            | _(none; implies primaryKey)_           |
| `col.text(opts?)`              | TEXT                                   | `notNull, unique, primaryKey, default` |
| `col.integer(opts?)`           | INTEGER                                | `notNull, unique, primaryKey, default` |
| `col.real(opts?)`              | REAL                                   | `notNull, default`                     |
| `col.boolean(opts?)`           | INT 0/1 ⟷ PG BOOLEAN                   | `notNull, default`                     |
| `col.timestamp(opts?)`         | ISO-TEXT (both dialects)               | `notNull, defaultNow, onUpdate`        |
| `col.json<T>(opts?)`           | TEXT ⟷ PG JSONB                        | `notNull, default`                     |
| `col.enum(values, opts?)`      | TEXT + CHECK (both)                    | `notNull, default`                     |
| `col.reference(target, opts?)` | FK intra-scope / plain col cross-scope | `notNull, onDelete`                    |

Decisions baked in:

- **`primaryKey` only on `text`/`integer`** (natural keys: `settings.key`, `cron.name`, `roles.slug`). `id()` is the ULID convenience implying PK. No composite PKs in the 13 tables → PK stays a column-level flag, not a table-level descriptor.
- **`default` takes a SQL-literal only** (string/number/boolean). Generated defaults (ULID, now) are `id()`/`defaultNow`, never `default` → literals become SQL `DEFAULT`, generated values run in the app codec, neither path drifts a migration.
- **`defaultNow` + `onUpdate`** are timestamp-only sugar. `onUpdate` = the app codec stamps `new Date().toISOString()` on every `update`/`updateMany` (no SQL trigger).
- **`enum(values)`** — `values` as a `readonly string[]` (`const` generic) → TS literal union + a `CHECK` in both dialects.
- **No `$type` escape hatch except `json<T>`** — every other kind's TS type is fully determined by its kind.
- **Omitted deliberately:** `blob`/binary (media bytes live in storage adapters, not the DB), `bigint` (`integer` covers sizes/counts/legacy unix-ms). Add if a real case appears.

### Q3 — Unified `reference`

One `col.reference(targetTable, { onDelete?, notNull? })`. Collapses the handoff's two-mechanism split (`reference` + `references`). Semantics, all auto-derived from the descriptor (author never thinks about scope):

- **Target is a table**; the FK targets its PK. (FK-to-non-PK-unique deferred — nothing does it today; add `{ column }` later if needed.)
- **Every reference is populatable** (that's the concept).
- **FK emission is automatic:** intra-scope (core↔core, plugin↔own) → real DB FK; cross-scope (plugin→core) → plain column. Keeps plugin journals independent (a cross-scope FK would force a plugin migration to run after core's table exists).
- **`onDelete` valid only intra-scope** — setting it cross-scope is a generate-time validation error. Default omitted: `no action` intra-scope; cross-scope dangling → `null` on populate regardless.

Examples:

```ts
createdBy: col.reference(users),                              // core→core FK, populatable, no cascade
stagedFor: col.reference(entries, { onDelete: 'cascade' }),
entryId:   col.reference(entries, { onDelete: 'cascade', notNull: true }),
// plugin → core: plain column, still populatable
createdBy: col.reference(users),
```

### Q2 — Index declaration

Second callback returning an array of named `index()` descriptors:

```ts
defineTable(
    'entries',
    ({ col }) => ({
        /* columns */
    }),
    ({ index }) => [
        index('idx_entries_type', ['type']),
        index('idx_entries_status', ['type', 'status']),
        index('entries_locale_group_locale_unique', ['localeGroup', 'locale'], {
            unique: true,
        }),
        index('entries_type_locale_slug_unique', ['type', 'locale', 'slug'], {
            unique: true,
            where: 'stagedFor IS NULL',
        }),
    ]
);
```

- **Column refs are `(keyof Cols)[]`** — typo-safe, no phantom state needed.
- **Explicit index names required** — index identity in the snapshot = its name; a rename reads as drop+create (consistent with no-rename policy). No auto-naming → no derivation drift.
- **`unique` is a flag**, not a separate `uniqueIndex` fn. Single-column uniqueness still lives in the `col` factory; multi-column goes here.
- **Partial `where` = raw SQL string.** Only `stagedFor IS NULL` is in use; `col IS NULL`/`col = 'x'` is identical in SQLite + Postgres. Generator passes it verbatim, diffs it as an opaque string. No predicate-AST builder (gold-plating for one call site). Author owns portability of exotic predicates.

---

## 4. Read `where` DSL — LOCKED (Q5) — **Feature 2**

Flat `findMany` covers the 90% case; anything it can't express drops to `query()` (raw Kysely).

```ts
findMany({
    where: {
        type: 'blog', // bare value → eq
        status: { in: ['published'] },
        deletedAt: null, // bare null → IS NULL
        publishedAt: { lte: now },
        title: { like: '%foo%' },
    },
    orderBy: [
        ['type', 'asc'],
        ['createdAt', 'desc'],
    ],
    limit: 20,
    offset: 0,
});
```

- Operators inside the per-column object: **`eq, ne, in, notIn, gt, gte, lt, lte, like`**. Bare value → `eq`; bare `null` → `IS NULL`; `{ ne: null }` → `IS NOT NULL`.
- All keys AND together. **No `or`, no `not(...)` nesting, no raw SQL** in the flat form — that's the `query()` boundary. `like` stays case-sensitive (no `ilike`).
- Typing: `where` keys `keyof Cols`, operator values typed to the column JS type; `orderBy` is `[keyof Cols, 'asc'|'desc'][]`.

---

## 5. Write API — LOCKED (Q6) — **Feature 2**

Writes are a _mandatory_ choke point so the codec (inject defaults → serialize → parse return) always runs.

```ts
create(data): Promise<T>                       // insert, returns parsed row
update(id, patch): Promise<T>                  // by PK, returns updated row, throws if missing
delete(id): Promise<void>                      // by PK, hard delete
updateMany(where, patch): Promise<number>      // conditional (absorbs maintenance ops), returns count
deleteMany(where): Promise<number>             // conditional, returns count
upsert(data, { target?, set? }): Promise<T>    // default conflict target = PK
```

- Singular `update`/`delete` by PK = the 95% case (matches today's `update(id, data)`). `update` throws if no match; `updateMany` returns 0 silently.
- `updateMany`/`deleteMany` take the §4 flat `where` and absorb the maintenance ops (`publishDueScheduled`, cron-lock, `purgeTrashedBefore`) **inside** the choke point, so `onUpdate` stamping + JSON-serialize still apply. No bulk write needs raw `query()`.
- **Partial semantics:** `patch` is `Partial<Insert>`. Only provided keys written; omitted untouched; explicit `null` sets null (nullable cols only — typed). `onUpdate` timestamps auto-stamped regardless.
- **`upsert`** default conflict `target` = PK; `set` defaults to all provided non-target columns; both overridable.
- **No built-in soft-delete in the generic wrapper.** `delete` = hard delete. Soft-delete stays a _domain_ policy: entries' trash does `update(id, { deletedAt })` and reads filter `deletedAt: null` themselves (as today). No `deletedAt` awareness baked into every table.

### Reads (handoff §E, Feature 2)

- `findOne(where)` → unique lookup → `T | null` (by id / email / any unique col — replaces `get(id)`).
- `findMany({ where, orderBy, limit, offset })` → `T[]`, **or** `findMany(qb => qb…)` builder callback → `T[]`. Both decode + return typed objects.
- `query()` → raw scoped Kysely builder (undecoded escape hatch — joins/custom shape; caller owns decode).
- No `findFirst` (use `findMany` `limit:1`). No nestable `{where,include,select}` DSL.
- `populate` option: `findMany({ populate:['createdBy'] })` → batched app-level resolve of `reference` columns → `T & { createdBy: User|null }`. Cross-scope populate is a CORE service (plugin never queries `users` itself).

---

## 6. Column model & codec — LOCKED (handoff §C/§D)

- **IDs = ULID** (text PK, app-generated; switch from current `crypto.randomUUID`). Arbitrary `text().primaryKey()` still supported for natural keys.
- **Timestamps = ISO-8601 UTC `TEXT` in BOTH dialects.** Value = `new Date().toISOString()` (`2026-06-24T12:34:56.789Z`): 24-char fixed-width → lexicographic == chronological; identical store + read across dialects (no driver-Date divergence); no where-clause branch. Do NOT use SQLite `CURRENT_TIMESTAMP`. Cost: no native PG in-SQL date math (fine for a CMS). **NOTE:** this changes the on-disk format from today's unix-**seconds** INTEGER. Drizzle's `integer({ mode: 'timestamp' })` stores **seconds** (`Math.floor(getTime()/1000)` write, `value*1000` read) — NOT milliseconds. The 1:1 Kysely port in step 1 keeps that exact seconds-INTEGER format (see step-1 handoff); the ISO-TEXT switch lands with `defineTable` in step 2.
- **Cross-dialect mappings:** `id`=ULID text; `json`=TEXT(SQLite)/JSONB(PG); `enum`=TEXT+CHECK both; `boolean`=INTEGER 0/1(SQLite)/BOOLEAN(PG); `timestamp`=ISO TEXT both. Only real per-dialect branches: `json`, `boolean`.
- **Defaults:** app-side `$default` thunk for generated values (ULID, now); SQL `DEFAULT` only for static literals. App-side defaults are code (never trigger a migration) but cannot backfill existing rows (see §A validation rule).
- **Codec = schema toolkit + thin row codec, NOT an ORM.** Each column kind carries 4 artefacts: (a) per-dialect DDL, (b) TS type, (c) admin metadata, (d) runtime codec = `default` + `serialize`(JS→storage) + `parse`(storage→JS). Codec runs at the storage choke point: `create()` loops the descriptor → inject `col.default()` for `undefined` → `col.serialize()` → Kysely insert → `col.parse()` on the returned row. A `for` loop, no proxies.
- **The only read codec that matters is JSON parse** — every other type is read-transparent by storage-format choice. Lean on Kysely-native facilities (`ParseJSONResultsPlugin`, `ColumnType<Select,Insert,Update>`, dialect type-parsers) to shrink the hand-written layer.
- **Types: type-level inference, no codegen.** Core `DB` = intersection of core descriptors; plugin scoped `DB` = its own only.

---

## 7. Migration generator — LOCKED principles (handoff §A) / internals OPEN

- **TOTAL generator, no human-in-the-loop at generate time.** Every change expressible in `defineTable` produces correct DDL. Partial generator = two worlds = drift. Total, or fall back to classic hand-written migrations entirely.
- **NO rename detection, ever.** Descriptor is _state_, not _history_. A rename reads as drop+add; the add auto-generates, the drop is destructive. Data-preserving rename = hand-authored data migration. Deletes Drizzle's hardest subsystem; keeps `db:generate` deterministic/non-interactive.
- **Auto-rebuild EVERYTHING on SQLite** (~8 statements, derivable from snapshot diff): `PRAGMA defer_foreign_keys=true` (NOT `foreign_keys=OFF` — ignored in a tx, causes Drizzle data-loss bug #5782) → `BEGIN` → `CREATE __new_x` → `INSERT __new_x SELECT … FROM x` (column map from old→new; dropped cols omitted) → `DROP x` → `ALTER __new_x RENAME TO x` → recreate indexes → `COMMIT`. Inbound FKs survive (new table reuses the name).
- **Generate-time VALIDATION ERRORS for impossible states** (deterministic, not prompts). Canonical: adding a `NOT NULL` column to a possibly-populated table requires a **SQL-literal** default (the rebuild's `INSERT…SELECT` is pure SQL, can't call an app-side default) — else a data migration, else generate-time error.
- **Destructive ops** (drop col/table): emit with a **loud printed warning**, no `--force`/prompt. Removing a column from the descriptor _is_ the intent to drop.
- **Application = Kysely Migrator** (pure SQL → edge/D1-safe). **Generation = dev/CI only** (Node). Split by environment; no generator binary runs at runtime.
- **Per-dialect** keys off a `sqlDialect` tag, never the concrete driver. SQLite first, Postgres adapter slots in.
- **Data migrations:** hand-authored TS (`up(db: Kysely)`), interleaved into the one ordered journal by authorship time; discipline = expand → backfill → contract. Schema = 100% generated; data = 100% hand-authored; never mixed within schema. Journal per-site, app-owned (today `apps/demo/drizzle`).
- **Snapshot/journal format:** model on drizzle-kit's (`version/dialect/id/prevId` chain; `tables{columns,indexes,pks,uniques,fks}`; journal `idx/when/tag/digest`) but trimmed — no rename-resolver, no MySQL.

### Plugin tables — OPEN/managed (handoff §B)

- Open keeps core lean: table-owning features (forms, analytics, e-commerce…) live _outside_ core as optional installable plugins. Optionality + tables ⇒ open.
- **Mechanism:** plugin declares `alias`; gets an **alias-bound scoped `table`/`col` factory** → auto-prefixes `plugin_<alias>_*` (manual prefixing gone). Runtime `db` is `Kysely<PluginDB>` typed from the plugin's own descriptors only → core tables type-unaddressable (via inference, no codegen). Same underlying connection.
- **Plugins ship self-contained journals.** Author runs generate scoped to its descriptors, commits migrations into the package; the site only applies them (never generates for plugin tables — the site's baseline is unknown). Like Rails engines / Django apps.
- **Removal:** leave-on-remove + track-installed-plugins + warn + explicit `purge`. Generator only diffs currently-installed plugins.
- **Threat model:** plugins are trusted, in-process, config-as-code. Type-scoping + prefixing prevent accidents, not malice (raw `` sql`…` `` can still reach core tables). True isolation = separate connection/attached-schema per plugin — out of scope.
- **Cross-scope populate is a CORE service:** a plugin's `createdBy → users` is resolved by core (full db), returned to the plugin.

---

## 8. Out of scope / deferred

- **Relationships / field model** (handoff §7–8 of the prior doc): three-way storage split, polymorphic relationships table, nested-in-block relationships (`instanceId`-keyed), type-aware `where`, batched populate of content relationships, versioning relations-snapshot, pushing visibility predicates into SQL. The content-relationships **table** is separate from `col.reference` — don't conflate. A near-final relationships-table shape exists (`sourceId, sourceType, name, instanceId, targetId, targetType, position`) but the user wants to revisit → treat as undecided.
- **Postgres driver** (step 8 of the original sequence; `additional-database-drivers.md`).

---

## 9. OPEN specifics still to refine (before/while implementing Feature 1 steps 2–4)

Grilled & locked so far: #1 (column-builder API), #2 (write API — Feature 2), #3 (where DSL — Feature 2), **#4 #5 #6 #8 #11 (step 4)**, **#9 #10 (step 5)** — see the per-step "locked implementation decisions" sections. Remaining: 7. Dialect seam: `driver.sqlDialect` tag + `createKyselyDialect()`; config selects driver: `sqlite({url})` / `turso({url,authToken})` / `d1({binding})` / `postgres({url})` / `neon({url})`.

---

## 10. Operational gotchas (heed when implementing)

- **Never `--no-verify`.** Confirm before any commit/push to `main`; `git rev-parse --abbrev-ref HEAD` in the same block as a commit (concurrent agents flip the shared tree's branch).
- **Commit/stash before launching a worktree agent.** Worktrees resolve deps/dist to the MAIN checkout — copy `routeTree.gen.ts` in before trusting worktree admin typecheck.
- **Coder agents must run `npm run lint`**, not just `tsc`. Re-run the gate yourself; agents mis-report it.
- Test harness: `:memory:` db **poisons** the base connection after a storage tx — use a per-test temp **file** db to read committed tx results. `test:run` skips tsc → run typecheck after editing tests.
- `npm run build` DTS worker can OOM → bump `NODE_OPTIONS` heap.
- Domain `index.ts` barrels re-export the server service (getDb/virtual config) → admin/browser + config-load-time code must deep-import pure leaf helpers, not the barrel.
