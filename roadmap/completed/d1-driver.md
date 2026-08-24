# D1 Driver (Cloudflare)

Split out of `planned/additional-database-drivers.md` on 2026-07-29 when the
driver was built. The remaining dialects (Postgres, MySQL) stay in that file.

**Status:** shipped. Built, unit-tested, verified against Cloudflare's own D1
implementation through wrangler's local emulation (which found and fixed a
defect that no fake could reach), and on 2026-08-16 **verified against remote
D1 on real infrastructure** — the last open item.

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
- [x] **Own introspector** (`database/drivers/d1-introspector.ts`). D1 runs
      every statement behind a SQLite authorizer that rejects a pragma
      table-valued function whose argument is a column reference —
      `pragma_table_info(tl.name)` — with `SQLITE_AUTH`. That is exactly the
      query Kysely's `SqliteIntrospector` uses, and `Migrator` introspects
      before creating its bookkeeping table, so **every migration on D1 failed**.
      A bound `pragma_table_info(?)` per table is allowed and produces identical
      `TableMetadata`
- [x] **Run it against local emulation.** `wrangler` is a devDependency,
      `packages/astromech/wrangler.jsonc` declares the `DB` binding, and
      `tests/cloudflare/d1-local-emulation.test.ts` runs binding resolution,
      CRUD, `meta` mapping, introspection and a migration chain against workerd
      in ~1s as part of the normal suite. This is what found the introspector
      defect: the pre-existing fake was libsql-backed, and libsql has no
      authorizer, so it answered the illegal query happily
- [x] **`libsqlDriver` moved to `astromech/database/libsql`** and dropped from
      the root barrel and from `astromech/database/schema`, so `@libsql/client`
      is no longer reachable from a Workers bundle. Verified against the built
      output, not just the source. Breaking

## Remaining

- [x] **Run it against remote D1.** Done 2026-08-16. A scratch Worker
      (imports from the built `dist`, never `src`) was deployed with
      `wrangler deploy` against a `wrangler d1 create`d database
      (`astromech-remote-test`, EEUR) and ran the same checks as
      `tests/cloudflare/d1-local-emulation.test.ts` on real infrastructure:
      binding resolution through the runtime-detected `cloudflare:workers`
      dynamic import, CRUD, `meta` mapping (`insertId` bigint, affected-row
      counts), introspection through the bound `pragma_table_info(?)` under
      the **remote** authorizer, and a migration chain without a transaction.
      All passed. The Worker was deleted after the run; the database was kept
      for future testing
- [x] Decided: the sequential fallback is the documented contract and a D1
      deployment does **not** refuse to boot —
      `DECISIONS.md`
