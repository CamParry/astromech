# D1 Driver (Cloudflare)

Split out of `planned/additional-database-drivers.md` on 2026-07-29 when the
driver was built. The remaining dialects (Postgres, MySQL) stay in that file.

**Status:** built and unit-tested; **never executed against real D1 or against
wrangler's local emulation.** That last step is what keeps this in
`in-progress/`.

## Built

- [x] `d1({ binding: 'DB' })` on `resolveBinding`, mirroring `r2()`'s
      binding-**name** indirection (a string resolves in every runtime; an
      `import { env } from 'cloudflare:workers'` does not resolve in the plain
      Node process the CLI runs in)
- [x] Hand-written Kysely dialect (`database/drivers/d1-dialect.ts`) rather
      than the community `kysely-d1`: that package hard-throws on transactions,
      pins `kysely: "*"`, is single-maintainer, and cannot do the async binding
      resolution we need
- [x] `getInstance()` stays **synchronous** — binding resolution happens inside
      `acquireConnection()`, which Kysely already awaits. The driver interface
      did not need widening, which was the open question in the original note
- [x] `DatabaseDriver.createDialect()` — the seam that let better-auth stop
      being hard-wired to `LibsqlDialect` over a shared `@libsql/client`
      `Client`. The `dbClient` registry and `DatabaseDriver.getClient` were
      deleted with it
- [x] `supportsTransactions: false` + entry storage omits its optional
      `transaction` method, so the existing sequential fallbacks in
      `operations/create.ts`, `internal/bulk.ts` and `operations/staging/merge.ts`
      engage. D1's only atomicity primitive is `batch()`, which cannot
      interleave app logic — this is permanent, not a gap
- [x] No `dump`/`restore`. `D1Database.dump()` only ever worked on alpha-era
      databases; export and PITR are control-plane only. `@astromech/backups`
      already feature-detects and reports `canDump: false`
- [x] Exported from `astromech/database/d1`, its own subpath, so a Workers bundle
      never pulls libsql in
- [x] Migrations verified to apply without a transaction — Kysely's `Migrator`
      only opens one when the adapter reports transactional DDL support, and
      `SqliteAdapter` reports `false`. A test pins this, since the whole D1
      migration story rests on it
- [x] `apps/docs/configuration/database.md`

## Remaining

- [ ] **Run it for real.** No Cloudflare driver in this repo (`r2()` included)
      has ever been executed against the real platform or against wrangler's
      `getPlatformProxy()` — `tests/cloudflare/bindings.test.ts` says so
      outright. Needs `wrangler` as a devDependency and a `wrangler.jsonc` with
      a D1 binding, then a migrate + CRUD round-trip through the local
      emulation. Deliberately not done on this branch: it means a lockfile
      change while three other branches are in flight
- [ ] Decide whether a D1 deployment should refuse to boot when something the
      site depends on needs atomicity, or whether the sequential fallback is
      simply the documented contract (currently the latter)

## Noted, not part of this

- `libsqlDriver` is exported from the **root** barrel, so `@libsql/client` is
  reachable from every consumer of `astromech` — including Workers bundles.
  The storage drivers avoid this with per-driver subpaths. Moving it to
  `astromech/database/libsql` and dropping it from the root is a small breaking
  change worth making before release.
