# `@astromech/backups` Plugin

First-party plugin: scheduled DB dumps offloaded to storage, with run-now,
download, restore, and manual delete. v1 targets **libsql/SQLite** on
self-hosted Node. D1/Postgres are deferred-but-accommodated via the per-driver
capability seam. Scope is **full-featured but simple** — a working, usable
plugin, nothing advanced.

Design was grilled and locked (see commit history). Durable architecture: `ARCHITECTURE.md` (scheduler, plugin capability ports, app-owned migrations).

## Core architecture (prerequisite — surfaced by dogfooding)

### Migration pipeline → app-owned, dynamic

- [x] `db:init` applies from the **app cwd's** `./drizzle` (not the core package's hardcoded folder).
- [x] npm scripts call the `astromech` CLI (`db:generate`/`db:init`), not raw drizzle-kit against a static config.
- [x] Delete hardcoded plugin schema paths + static `drizzle.config.ts` (core + demo); `db:generate` codegens an ephemeral config from the app's plugin list (`schemaModule` specifiers).
- [x] Relocate existing migrations `packages/astromech/drizzle/` → `apps/demo/drizzle/` (preserve `meta/` journal). Core ships schema/types, not migrations.

### Expose storage + db capabilities to plugins (sanctioned port, no boundary-crossing)

- [x] `ctx.storage` — plugin-scoped view, keys auto-prefixed `plugin/<alias>/` (de-prefixed on read/list); backed by the storage registry.
- [x] DB-driver registry (retain the `DatabaseDriver` object, not just the drizzle instance).
- [x] `ctx.database` — `{ dialect, dump?, restore? }`, feature-detected, backed by the driver registry.
- [x] Export the new public types from the `astromech` entrypoint.

## Core seam (in `packages/astromech`)

- [x] Add optional `dump?()` / `restore?()` to `DatabaseDriver` (`src/types/config.ts`).
- [x] Implement `dump`/`restore` in the libsql driver (`src/database/drivers/libsql.ts`):
    - `dump`: `VACUUM INTO <temp>` via `db.run(sql\`...\`)`, return the temp file path / stream.
    - `restore`: validate (`PRAGMA quick_check`) → `ATTACH` → transactional per-table
      `DELETE` + `INSERT … SELECT` → `DETACH`. Preserve `plugin_backups_runs` +
      `_astromech_cron` (skip those tables). Requires matching schema (fail loud otherwise).
    - d1/postgres drivers: leave `dump`/`restore` unimplemented (feature-detected off).

## Plugin package (`packages/plugins/backups`)

- [x] Scaffold: `manifest.ts` (identity), `index.ts` (`definePlugin`), `types.ts`,
      `package.json`, `tsconfig`. Register in `apps/demo` config.
- [x] `schema/runs.ts` — `plugin_backups_runs` table: id, key, status
      (`success`/`failed`/`running`), trigger (`scheduled`/`manual`/`pre-restore`),
      sizeBytes, error, createdAt, finishedAt, `artifactDeletedAt`. Ship via
      `schema: [runsTable]` + `schemaModule`. Add to repo `drizzle.config.ts`; run `db:generate`.
- [x] `runBackup({ db, config })` — schedule-agnostic core: claim cron-row lock →
      write `running` row → `driver.dump()` → gzip → `storage.put('backups/<ts>-<id>.sqlite.gz')`
      → finalize row (`success` + size) → rotate (keep-N) → release lock. On error: mark `failed`.
- [x] Cron job registration: `registerCronJob({ name: 'backups', schedule: '0 3 * * *', handler })`.
      Seed schedule only; cron table is source of truth.
- [x] Retention (keep-N, default 7) from `plugin:backups:*` settings; rotate after each
      successful run; set `artifactDeletedAt` on pruned rows (keep the row).

## API / permissions

- [x] Permissions: `backups:read`, `backups:run`, `backups:restore`, `backups:delete`.
- [x] Routes (admin-authed, `can()`-gated):
    - `GET  …/backups` — list runs (from table).
    - `POST …/backups/run` — run-now (force path; calls `runBackup`, reuses cron lock,
      does NOT shift cadence; returns "already running" if locked).
    - `GET  …/backups/:id/download` — stream artifact via `storage.get(key)` (never `getDirectUrl`).
    - `POST …/backups/:id/restore` — auto safety-snapshot (`trigger: pre-restore`) → `driver.restore()`.
    - `DELETE …/backups/:id` — delete artifact + set `artifactDeletedAt`.

## Admin UI (custom component page)

- [x] Backups page: list runs (status/trigger/size/date), run-now, download,
      restore (destructive confirm dialog: plain consequence + safety-net reassurance +
      re-login warning; single red Restore button), delete. Read-only status (last/next run).
- [x] Feature-detect capabilities: no `dump` → advisory + disabled; no `restore` → hide restore.

## Tests

- [x] libsql `dump` → `restore` round-trip (real fixture DB, never mock).
- [x] Retention keep-N rotation.
- [x] Run-now lock prevents concurrent dumps; manual run doesn't shift cadence.
- [x] Restore preserves `plugin_backups_runs` + `_astromech_cron`.

## v1 limitations / deferred

**Known deviations from the spec:**

- **Run-now overlap guard is in-process only.** The run-now path uses a module-level
  flag, not the `_astromech_cron` lock. Concurrent manual + scheduled runs across
  multiple instances are unguarded in v1. Tracked in backlog.
- **libsql dump/restore is local `file:` only.** `VACUUM INTO` requires a local file;
  Turso/remote libsql connections reject it. Remote support is deferred.

**Deferred (not v1 — see backlog):**

- UI to edit schedule/retention (future "backups settings page").
- Encryption at rest.
- D1 (Time Travel / export-to-R2) and Postgres (`pg_dump`/`pg_restore`) dump/restore.
- Cloud no-op/advisory presentation polish.
- Exclude `pre-restore` snapshots from the keep-N count.
- Multi-instance run-now lock (reuse `_astromech_cron` lock).
- Admin settings UI for schedule + retention.
- `startedAt` sub-second rotation tiebreak.
