# Scheduler & Backups

**Status:** **Slice A (cadence-aware scheduler) implemented 2026-06-16** — tests-only validation, no dogfood plugin (see §8 Slice A). **Slice B (`@astromech/backups`) unimplemented.** Two deliverables in order: **(1) a cadence-aware, runtime-adaptive scheduler** (core; proven by tests), then **(2) `@astromech/backups`** built on top.
**Supersedes (in part):** ROADMAP Phase 16 ("CRON System") — Phase 16 shipped the registry + a run-everything runner; this design adds real cadence, adaptive triggering, and runtime-editable schedules.
**Touches (scheduler):** `src/cron/{registry,runner,index}.ts`, new `src/cron/drivers/{node,cloudflare,http}.ts`, `src/types/config.ts` (`SchedulerDriver`), `src/db/schema.ts` (cron-state table), `src/adapters/astro.ts` (driver wiring), the runtime entry's `scheduled()` handler, `src/api/routes/cron.ts` (poke endpoint + auth).
**Touches (backups):** `src/types/config.ts` (`StorageDriver.list` + `DatabaseDriver.dump`/`restore`), `src/db/drivers/*` (per-dialect dump), `src/storage/*` (`list` + private retrieval), new `src/plugins/backups/*`.
**Related:** ROADMAP Phase 16 (CRON), Phase 23 (DB drivers), Phase 19 (`@astromech/backups`).

---

## 1. Background & Motivation

Phase 16 shipped a cron **registry** (`globalThis.__astromechCronJobs`), a **runner** (`runScheduledJobs`) that executes **every** registered job on each tick, two built-in jobs (`scheduled-publish`, `trash-purge`), and an HTTP trigger (`POST /api/cms/cron/run`). Two things are unsolved:

1. **Cadence is a lie.** `CronJob.schedule` is metadata only — the runner ignores it and runs everything on each tick. Plugin cron jobs (18a) inherited the same "metadata until the runner supports cadences" caveat.
2. **Triggering has no per-runtime story.** The HTTP endpoint works only if something external pokes it; there is no Node in-process driver and no wired Cloudflare `scheduled()` handler.

This phase makes cadence **real** and **adaptive** across runtimes, adds **runtime-editable** schedules (admin can change a job's frequency without redeploying), and then uses backups as the first real consumer — a feature that touches the **scheduler, the DB driver, and the storage driver** at once, which is precisely why it's the right stress test.

---

## 2. Cron vs Queues — Two Primitives, Kept Separate (Locked)

A recurring question: does scheduling bleed into background **queues**? Decision: **they are distinct primitives that share substrate; do not merge them.**

|                | **Cron / Scheduler**                        | **Queue**                                                              |
| -------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| Trigger        | time-driven (cadence)                       | event-driven (on demand)                                               |
| Items          | few, named, code-defined, recurring         | many, ephemeral, carry payloads                                        |
| Needs          | due-evaluation vs a clock                   | retries, backoff, dead-letter, concurrency limits, visibility timeout  |
| Runtime-native | CF Cron Triggers; Node timer/system crontab | CF Queues (separate binding); Node = BullMQ/Redis, pg-boss, DB-polling |

**Overlap (named so we don't rebuild one inside the other):** a cron tick is a natural **producer** into a queue (nightly fan-out: "enqueue one job per tenant"); a queue's **delayed-delivery** can mimic "run once at time T" — but _recurring cadence_ stays a scheduler concern. The relationship is **composition, not inheritance**.

**Decision:** Queues are a **separate, deferred system**. Not needed for backups (a single recurring job = pure cron). The real driver for queues is **durable side-effects** — forms notification emails, Mailchimp forwarding, outbound webhooks, search-index updates (today those `after*` hooks run inline + swallow-and-log). Build it around the Forms phase (18c) or its own phase, as a `QueueDriver` that **parallels `SchedulerDriver`** and reuses the same lock/CAS substrate. The only seam reserved now: a cron handler may `enqueue()` once a queue exists.

---

## 3. Decisions (Locked)

### 3.1 Core owns cadence — forced by runtime-editable schedules

A schedule editable from an admin page lives in the **DB**. A static `wrangler.toml` cron trigger (or a system crontab line) is fixed at deploy and **cannot** honor a DB-edited value. Therefore platform-native cron **demotes to a dumb frequent tick**, and the app reads the live schedule and decides what is due. This holds identically on Node, Workers, and external-poke — so "who owns cadence" is not a judgment call: **core owns it.** All drivers converge on one contract: **frequent poke → core due-evaluation against the live schedule.**

### 3.2 Adaptive `SchedulerDriver` (house driver pattern)

Mirror `EmailDriver`/`StorageDriver`/`DatabaseDriver`: an interface in `src/types`, concrete classes in `src/cron/drivers/*`, selection held in the existing `src/cron/registry.ts` (globalThis). The driver abstracts **triggering only**; it knows nothing about which jobs exist or are due.

### 3.3 Cadence + dedup live in a core table

A dedicated core table (e.g. `_astromech_cron`) is the single source of truth for due-evaluation. It **doubles as the multi-instance lock** — a CAS update on `last_run`/`lock` claims a job, killing the double-fire footgun when N Node instances (or overlapping ticks) fire at once. It is also exactly what the backups admin page renders later (frequency, enabled, last/next run) with no extra plumbing.

### 3.4 The registry holds handlers; the table holds cadence

Today the registry bakes `schedule` into the registered job. That flips: **registry = handler (code, static); table = effective schedule/enabled (data, mutable).** Manifest/built-in `schedule` becomes a **seed/default**, written to the table on first boot if absent; thereafter the stored value wins.

### 3.5 One dependency: a cron-expression parser

Due-evaluation needs to parse cron expressions and compute "is this due since `last_run`" / `next_run` (e.g. `cron-parser`). No scheduler library is needed — the Node default is a bare timer + core due-eval, so node-cron/Bree/BullMQ become optional power-user drivers, never the baseline.

### 3.6 Failure isolation & built-ins migrate

Per-job try/catch already exists in the runner; keep it (a job throw is contained + logged with attribution, never aborts the tick). The two built-ins (`scheduled-publish`, `trash-purge`) **migrate onto real cadence** — free regression test cases the moment cadence is real.

### 3.7 Backups is a plugin, not core

Cloud DBs already cover backups natively (D1 Time Travel/PITR, Neon PITR, Turso). The plugin's real audience is **self-hosted Node + vanilla SQLite/Postgres**. So it's opt-in and a **plugin** — but it builds on **core primitives**: `SchedulerDriver`, `db.dump()`/`restore()` (a DB-driver capability), and storage `list` (all core).

---

## 4. `SchedulerDriver` Interface

```ts
export type SchedulerDriver = {
    readonly name: string;
    /** Begin producing ticks; each tick invokes onTick(now). */
    start(onTick: (now: Date) => Promise<void>): void | Promise<void>;
    stop?(): void | Promise<void>;
};
```

`onTick` is core's due-evaluator: read enabled rows from the cron table, compute which are due at `now` vs `last_run`, CAS-claim each, run its handler, record `last_run`/`next_run`, release.

Drivers (`src/cron/drivers/`):

| Driver       | Tick source                                                          | Notes                                                                                                                     |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `node`       | `setInterval` (~60s) → `onTick(new Date())`                          | default; long-running Node servers; no extra dep                                                                          |
| `cloudflare` | Worker `scheduled()` event → `onTick(new Date(event.scheduledTime))` | `wrangler.toml` cron set to a fixed frequent cadence (e.g. `* * * * *`); the platform is a dumb ticker, cadence is core's |
| `http`       | `POST /api/cms/cron/run` → `onTick(now)`                             | for system crontab / external pollers / serverless Node; **shared-secret/header guard required**                          |

`event.cron` native per-expression routing stays available as a driver-internal _optimization_, never the contract.

---

## 5. Cadence Model & the Cron Table

`_astromech_cron`: `name` (PK), `schedule` (cron expr), `enabled`, `last_run`, `next_run`, `lock` (claim token/expiry). Seeded from registered jobs' default `schedule` on first boot; thereafter authoritative.

Due-eval per tick: `enabled && next_run <= now` → CAS-claim (`lock` empty/expired) → run → set `last_run = now`, recompute `next_run` from `schedule`, clear `lock`. A crashed/timed-out claim's `lock` expires so the next tick retries.

---

## 6. Runtime-Editable Schedules

Because cadence is read from the table per tick (§3.3), changing a row's `schedule`/`enabled` takes effect on the **next tick** with no redeploy — the property the backups admin UI relies on. Editing is just a write to `_astromech_cron`; core jobs and plugin jobs share the mechanism. (Plugin-owned schedules may alternatively surface via the namespaced settings table; the cron table remains the due-eval source of truth either way.)

---

## 7. Backups — Built on the Scheduler

Backups is the **orchestrator** composing three seams: **when** (scheduler), **how to dump** (DB driver), **where to put it** (storage). The dump _production_, not the destination, is the hard, runtime-divergent part.

### 7.1 `db.dump()` / `db.restore()` — a DB-driver capability (adaptive)

`DatabaseDriver` today is only `{ type, getInstance() }`. Add an **optional** dump/restore capability, implemented per dialect:

- **libsql/SQLite (Node):** `VACUUM INTO` or file copy — trivial, fully buildable now.
- **D1 (Cloudflare):** do **not** stream rows in a Worker (CPU/mem limits). Delegate to platform export-to-R2 / Time Travel. **Gated on D1 landing** (the D1 driver is currently a throwing stub).
- **Postgres:** `pg_dump`/`pg_restore`. **Gated on the Postgres driver** (Phase 23 — not yet a driver).

Restore is more dangerous and more divergent than dump; design the capability so a driver may implement `dump` without `restore`, and the plugin gracefully hides restore where unsupported.

### 7.2 Storage as sink — needs more than media shape

`StorageDriver` is media-shaped: `upload(File, path)`, `delete`, `getUrl` (**public** URL), and **no `list`**. Backups need **`list`** (retention/rotation) and **private retrieval** (a dump must not be a public URL). Either extend the storage interface (`list` + a private-fetch notion) or point backups at a separate destination. Decide during the backups slice; keep `SchedulerDriver` agnostic of it.

### 7.3 Admin UI

A backups edit page reads/writes `_astromech_cron` + storage `list`: change **frequency** (editable schedule), **enable/disable**, see **last/next run**, **list existing backups**, **run now**, and — where the driver supports it — **restore**. This is the concrete payoff of runtime-editable schedules + storage `list`.

### 7.4 Multi-everything matrix (design target)

Backups must be considered across **runtime** (Node / Workers), **database** (SQLite/libsql now; Postgres/D1 later), **storage** (filesystem now; R2/S3 later), and **scheduling** (the three drivers). Most cloud combinations have native backups and may make the plugin a no-op; the self-hosted Node + vanilla SQLite/Postgres combination is the one that needs it.

---

## 8. Implementation Slices

### Slice A — Cadence-Aware Scheduler (core; tests-only validation) ✅ Implemented 2026-06-16

Parser = `croner` (UTC substrate + configurable site `timezone`, default UTC). The `lock` column is a claim-expiry timestamp that doubles as the claim token; release CAS is gated on the exact token (ABA-safe). Seeding is lazy (first `onTick`, `INSERT … ON CONFLICT DO NOTHING`). Missed runs fire once (no backfill). The poke (`POST /cron/run`) runs a due-eval tick and authenticates via admin session OR `Bearer $ASTROMECH_CRON_SECRET`.

1. `SchedulerDriver` type + `src/cron/drivers/{node,cloudflare,http}.ts`; selection in `src/cron/registry.ts`.
2. `_astromech_cron` table (`src/db/schema.ts`) + seed-from-registry on boot.
3. Core due-evaluator (`onTick`): parse schedule (cron-parser), CAS-claim/lock, run, record `last_run`/`next_run`.
4. Migrate `scheduled-publish` + `trash-purge` onto real cadence.
5. Harden the `http` poke endpoint with a shared-secret guard.
6. Wire the `node` timer (dev/long-running) and the Cloudflare `scheduled()` handler (fixed frequent cron).
7. **Tests prove:** due-eval honors stored schedule; an edited schedule takes effect next tick; the lock prevents double-fire across overlapping/parallel ticks; runs under the node timer and a mocked Worker poke. **No dogfood plugin required.**

### Slice B — `@astromech/backups` (plugin)

1. `db.dump()` capability on `DatabaseDriver` (libsql `VACUUM INTO` first).
2. Storage `list` + private retrieval (or separate destination).
3. Plugin: a cron job (default cadence, runtime-editable) → `dump` → storage; retention/rotation.
4. Admin edit page: frequency, enable, last/next run, list, run-now, restore (capability-gated).
5. D1 / Postgres dump branches as **explicitly deferred** follow-ups, gated on those drivers landing.

---

## 9. Out of Scope / Deferred

- **Queues / background-job system** — separate primitive, separate phase (§2).
- **D1 & Postgres dump/restore** — gated on those DB drivers (Phase 23 / D1 wiring).
- **Storage interface extension specifics** (`list` signature, private retrieval) — decided in Slice B.
- **A generic admin "scheduled jobs" page** for core jobs — demand-driven; backups ships its own page first.
- **Sub-minute cadence** — the frequent-tick model targets minute granularity; finer cadence is a driver-specific concern if ever needed.
