# Table Definition System (Drizzle → homegrown `defineTable` + Kysely)

Replace Drizzle ORM with a homegrown schema toolkit + thin row codec over Kysely. Owns `defineTable`, a homegrown state-based migration generator, a per-column runtime codec, and the Kysely connection/types. NOT an ORM — raw Kysely stays the query layer.

**Design spec:** `specs/data-layer.md` (full locked decisions). This file tracks status only.

Feature 2 (the ergonomic `findOne`/`findMany`/`populate` storage wrapper) is split off → `data-layer-storage-api.md`.

## Sequence (strictly ordered; each step stays green)

### Step 1 — One-for-one Drizzle → Kysely _(DONE — committed `e2a0cbc` on `feat/data-layer-step1-kysely`; all bullets below shipped)_

- [x] Hand-write the Kysely `DB` interface mirroring the 13 core tables (+ plugin tables) — _done: `database/types.ts`_
- [x] Construct a Kysely instance (`CamelCasePlugin`) in the libsql driver; keep `getDb()/setDb()` + add shared-`client` registry; keep `DatabaseDriver` shape
- [x] Rewrite all storage queries to Kysely behind unchanged `createXStorage(db = getDb())` signatures
- [x] Replicate Drizzle column behaviours 1:1: **unix-SECONDS** INTEGER timestamps → `Date`, JSON parse/stringify, boolean 0/1 — _done: `database/codec.ts`_ (format change deferred to step 2)
- [x] Port transactions to `db.transaction().execute(async (trx) => …)`
- [x] better-auth → its built-in Kysely adapter over the shared client (plural/snake_case mapping)
- [x] Port the **backups** plugin's direct queries to Kysely (redirects = pure tableStorage; seo/menus/rating untouched)
- [x] Drop `drizzle-kit` + `apps/demo/drizzle` journal; hand-author one Kysely baseline migration (raw `CREATE TABLE`s); `db:init` → Kysely `Migrator`
- [x] Update test harness DB setup (`tests/_support/harness.ts`) to Kysely
- [x] Drop `drizzle-kit`; **keep `drizzle-orm` installed** AND its `*Table` schema objects (seed + tableStorage introspection + plugin authoring need them until step 5)
- **→ current implementation handoff: `/tmp/astromech-step1-impl-handoff.md`** (supersedes the original `astromech-step1-drizzle-to-kysely-handoff.md` with the corrected/locked decisions)

### Step 2 — Table definitions _(DONE — committed `aeefe75` on `feat/data-layer-step2-definetable`)_

Scope = **our 9 tables only** (`roles, entries, entry_versions, entry_preview_tokens, media, settings, notifications, relationships, _astromech_cron`). The **4 better-auth tables** (`users/sessions/accounts/verifications`) stay seconds-INTEGER + hand-typed (better-auth owns their format); **plugin tables** stay Drizzle until step 5.

- [x] `defineTable(name, ({col}) => cols, ({index}) => idx)` + `col` factory (options-object) + `enum`/`reference`/`id` (+ ULID dep `ulidx`; `reference` accepts string|descriptor|annotated-thunk for self/auth targets) — `database/define-table.ts`
- [x] Per-column runtime codec (default/serialize/parse) — descriptor-driven; replaces the `CODECS` map for the 9, keeps a legacy seconds map for auth + `plugin_backups_runs`
- [x] Type inference: ONE descriptor → both domain Row types (Select/Insert/Update) AND the storage-shaped Kysely `DB` cells (assembled with the 4 hand-typed auth tables)
- [x] Flip the 9 tables to ISO-TEXT timestamps + ULID ids: `baseline.ts` DDL timestamps `integer`→`text`, where-clause date literals → `toISOString()`, seeds ported Drizzle→Kysely+encode, reseed. Baseline stays **hand-authored** (DDL-emit is step 3)
- [x] Delete the **core** Drizzle `*Table` objects for the 9 (keep auth + plugin objects); `encode`/`decode`/`libsqlDriver` re-exported on `astromech/db/schema` for seeds. Gate + build + reseed + HTTP + browser smoke green.

### Step 3 — Generated artefacts off descriptors _(DONE — on `feat/data-layer-step3-emit`)_

- [x] DDL emit per dialect (SQLite first) — `database/ddl.ts` (`emitTableStatements`; enum CHECKs, table-level FKs, column-`unique` → synthesized unique index)
- [x] `snapshot.json` serialiser — `database/snapshot.ts` (deterministic; DDL-affecting state only; `id`/`prevId` chain deferred to step 4)
- [x] Admin metadata emit — `database/admin-meta.ts` (projects to existing `CellKind`/`FieldType` vocab; consumer is step 5's tableStorage replacement)
- [x] Baseline's 9 descriptor-backed sections replaced with emitter output + `sqlite_master` parity test (pre-step-4 drift gate); `stagedFor` FK aligned to NO ACTION; seed fixed (stale `media.url` key, `draft` → `unpublished`) — old db had masked both

### Step 4 — Migration diffing

- [ ] snapshot + diff → DDL (additive first, then SQLite full-rebuild)
- [ ] Generate-time validation errors (NOT NULL → literal default, etc.)
- [ ] CLI repoint: `db:generate` → homegrown generator
- [ ] Drift gate (build-two-ways parity + "generate produces no new migration" CI assertion)
- [ ] Regenerate baseline from descriptors; delete the hand-written step-1 baseline

### Step 5 — Scoped plugin factory

- [ ] `definePlugin({ alias, schema })` alias-bound `{table,col}` factory (auto-prefix `plugin_<alias>_*`)
- [ ] Plugin-owned journals (author generates, site applies only)
- [ ] `purge` command + installed-plugin tracking
- [ ] Port `@astromech/redirects` + `@astromech/backups` tables

## Open specifics (see spec §9)

#4 snapshot/journal format · #5 SQLite rebuild details · #6 validation rule set · #7 dialect seam · #8 CLI repoint · #9 descriptor discovery · #10 plugin factory · #11 drift gate. (#1 column API, #2 write API, #3 where DSL grilled & locked.)

## Deferred

- Postgres driver → `additional-database-drivers.md`
- Relationships / content-field data model → `populate-and-complex-field-data-model.md` + spec §8
