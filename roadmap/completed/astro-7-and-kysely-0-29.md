# Astro 7 and Kysely 0.29

Astromech's peer ranges are `astro@^6.0.8` and `kysely@^0.28.14`
(`packages/astromech/package.json`). Both have moved on, and an unpinned
install now fails with `ERESOLVE`:

- `astro` latest is 7.3.2, and `@astrojs/node` latest (11.1.5) requires
  `astro@^7.2.1`.
- `@astrojs/react` 6 requires Vite 8, so it pairs with Astro 7, not 6.
- `kysely` latest is 0.29.5, outside `^0.28.14`.
- `@libsql/client` latest is 0.18.0, outside the optional peer range
  `^0.17.2`.

Found on 2026-09-15 while testing `apps/docs/installation.md` against the
registry. The page pins `astro@6 @astrojs/react@5 @astrojs/node@10` until this
lands.

## The work

- [x] Read the Astro 7 upgrade guide and the Vite 8 changes against what core
      relies on: `injectRoute`, `addMiddleware`, `updateConfig`, the dev
      server's `optimizeDeps` (including the nested `a > b > c` entries in
      `packages/astromech/src/integrations/astro/vite.ts`), `astro sync`, and
      the Cloudflare adapter.
- [x] Read the Kysely 0.29 and `@libsql/client` 0.18 changelogs against the
      dialects and `@libsql/kysely-libsql`, which pins its own Kysely range.
- [x] Move to `@libsql/client` 0.18 and Kysely 0.29 (steps 1 and 2 below).
- [x] Move to Astro 7 and its adapters, upgrade both demo apps, and run the
      gate with both boot checks.
- [x] On a local file database, stop a better-auth write failing with
      `SQLITE_BUSY` while an app transaction is open. better-auth now queries
      through `getInstance().withoutPlugins()`, and `createDialect()` is gone
      from `DatabaseDriver`. `tests/users/auth-database.test.ts` failed with
      `SQLITE_BUSY` before the fix and passes after it.
- [x] Remove the pins from `apps/docs/installation.md` and
      `packages/astromech/README.md`.
- [x] Follow `apps/docs/installation.md` on a new site installed from packed
      tarballs, since generated sites gain the new migration import. Every
      step passed on 2026-09-15 with the guide's unpinned command (Astro
      7.3.2, Kysely 0.29.5, better-auth 1.7.5, `@libsql/client` 0.18.0). The
      warnings it showed are in `roadmap/completed/new-site-warnings.md`.

## Decisions

Research against the official release notes and source found that only
Kysely 0.29 breaks core outright: `Migrator`, `MigrationProvider` and the
migration table constants moved to `kysely/migration`, and the root keeps only
type-level stubs. Astro 7, Vite 8 and the adapters change nothing core's
integration uses.

- **Astro 7 only, `^7.2.1`.** Every official adapter is 7-only, each demo can
  install one major, so the Astro 6 half of a dual range would never be tested,
  and nothing is published yet. `^7.2.1` is the floor `@astrojs/node` 11
  resolves under.
- **Kysely `^0.29.1`.** No single import works on 0.28 and 0.29, and 0.29.1
  fixes a plugin result-transform regression that `CamelCasePlugin` depends on.
  Every package's Kysely range moves together, schema-engine's `*` included.
- **Generated migration indexes import `MigrationProvider` from
  `kysely/migration`**, the plain Kysely convention.
- **Kysely 0.29's `SqliteAdapter` serialises every query on an instance.** D1
  overrides `supportsMultipleConnections` to `true`, since a D1 connection holds
  no state and has no transactions. libsql keeps the lock for a local file,
  matching 0.17's one connection, and overrides it for a remote database.
- **better-auth shares the app's Kysely instance.** Its own instance had its
  own lock, and on a local file its writes failed with `SQLITE_BUSY` while an
  app transaction was open (all 200 sign-ins beside 5 held transactions in a
  throwaway test). A busy timeout did not help, since the wait blocks the event
  loop the lock holder needs. `DECISIONS.md` records the choice.
- **`@libsql/client` `^0.18.0`.** 0.18 gives a local client a connection pool,
  so `restore()`, which sends `ATTACH`, `PRAGMA` and `BEGIN` as separate calls,
  moves to a dedicated single-connection client.
- **better-auth `^1.6.28`**, the lowest version confirmed to accept Kysely 0.29.

## Order

1. libsql 0.18.
2. Kysely 0.29, with the introspector changes (`isForeign`, `getMetadata`
   removed) and the adapter overrides.
3. Astro 7, Vite 8, `@astrojs/react` 6, `@astrojs/node` 11 and
   `@astrojs/cloudflare` 14 together, since each needs the others.
4. Remove the install pins and test a packed install, since generated sites
   gain the new import.
