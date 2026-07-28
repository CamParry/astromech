# Additional Database Drivers

## D1 (Cloudflare)

The throwing `d1Driver()` stub was deleted on `feat/storage-drivers`. Its
message blamed per-request initialisation, which is no longer why D1 doesn't
work: `import { env } from 'cloudflare:workers'` resolves bindings at module
scope, and `astromech/cloudflare` already turns a binding NAME into a value in
both Workers and Node. Rebuilding on that seam is straightforward except for
one thing worth knowing before starting:

- [ ] `d1({ binding: 'DB' })` on `resolveBinding`. **`DatabaseDriver.getInstance()`
      is synchronous and binding resolution is async.** Do not widen the driver
      interface for this — a Kysely dialect resolves the binding inside
      `acquireConnection()`, which is already async, so `getInstance()` can
      return an instance immediately.
- [ ] A Kysely dialect for D1 (none exists in the repo; the community
      `kysely-d1` is the obvious starting point).
- [ ] Dump/restore are absent on D1 — confirm the backups plugin degrades
      cleanly rather than assuming `driver.dump` exists.

## Other dialects

Note v1 is SQLite-only; Postgres and MySQL are a future major.

- [ ] `src/db/drivers/postgres.ts` — Postgres driver
- [ ] `src/db/drivers/mysql.ts` — MySQL driver
- [ ] Drizzle schema variants for Postgres/MySQL column types
- [ ] Migration pipeline per dialect
- [ ] Update `AstromechConfig` DB config type for each dialect
- [ ] Test coverage for each new driver
