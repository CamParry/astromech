# Storage-layer follow-ups

Everything deliberately left behind by the data-layer storage API workstream
(`completed/data-layer-storage-api.md`, merged 2026-07-29), plus the pre-existing
defects that surfaced while migrating onto `createStorage`.

Filed together because most of them share one precondition: the raw-Kysely sites
above `storage/` have to move onto the wrapper before the codec can collapse.

## 1. Migrate raw Kysely above `storage/`

Four domains query the database straight from their service and have no storage
layer at all: `media`, `notifications`, `settings`, `users`. Raw Kysely also
lives in three transport files, `cron/runner.ts`, and three `backups`-plugin
files — 21 files in total.

These are the sites that most wanted `count(where)`, which did not exist until
the wrapper landed.

- [ ] Give `media` / `notifications` / `settings` / `users` a `createXStorage`
      composed on `createStorage`, matching the entries pattern
- [ ] Move the transport + cron + backups queries behind those factories
- [ ] Replace the hand-rolled count-then-rows pairs with `count(where)`

## 2. Collapse the codec (gated on 1)

`database/codec.ts` exposes the same three conversions twice: string-keyed
(`decode('entryVersions', row)`) and descriptor-keyed (`decodeWith(desc, row)`).
The string-keyed form needs a hand-maintained `DESCRIPTORS` map, and its call
sites double-cast through `unknown`.

**Precondition, stated precisely:** `DESCRIPTORS` deletes once no string-keyed
`decode`/`encode`/`encodePatch` call names a descriptor-backed table. Today half
of them are in the item-1 files (`settings`, `media`, `notifications`,
`cron/runner.ts`, `plugin-runtime.ts`).

- [ ] Delete `DESCRIPTORS` and the descriptor-table string-keyed paths
- [ ] Keep `LEGACY_CODECS` (the 4 better-auth tables) — better-auth owns that
      format regardless
- [ ] Keep `kyselyTableKey`. It is **not** legacy: it maps `descriptor.name`
      (snake) → the Kysely `DB` key (camel), and both `createStorage` and the
      plugin codec registry call it. An earlier draft had it deleted; a
      call-site census disproved that.

## 3. Pre-existing defects found while migrating

None of these were caused by the migration — each was verified to sit outside
its diff — but all were found by it.

- [ ] **`trashed: true` reads return nothing through the HTTP query endpoint.**
      The write path is correct: trashing removes an entry from the live list and
      restoring returns it, verified end-to-end against the demo. But a
      `trashed: true` read comes back empty via both `GET /:type?trashed=true`
      and `POST /:type/query`. `buildListWhere` in `entries/storage/built-in.ts`
      is byte-identical to what it was before the migration, so the filter SQL is
      not the cause. Leading hypothesis: the **public visibility shape** excludes
      trashed rows from that endpoint, and the admin UI's authenticated `full`
      read is what makes the trash view work. Start there.
- [ ] **`localeGroup` is minted with `crypto.randomUUID()`** even though its
      descriptor declares `defaultUlid: true`, so the descriptor default is dead
      code for that column and the id format is inconsistent with every other
      generated id. Deleting the `?? crypto.randomUUID()` makes it ULID.
- [ ] **A tx-bound storage's `transaction()` calls `getDb()`**, so it opens a new
      transaction on the base handle instead of reusing the bound one. Uncovered
      by tests.
- [ ] **`built-in.ts`'s own fixed-key `where` builder still reads a bare `null`
      as "no filter"**, while the shared DSL (and now `tableStorage`) reads it as
      `IS NULL`. It is a contained whitelist builder rather than the shared DSL,
      so nothing is broken — but the two disagree, and that is the kind of
      divergence that eventually bites.
- [ ] **`npm run db:seed` only works from the repo root.** The npm script sets
      cwd to `packages/astromech`, where the seed's hardcoded
      `./apps/demo/database.db` does not resolve; it fails with
      `ConnectionFailed`. Workaround today is
      `npx tsx packages/astromech/scripts/seed.ts` from the root. Bites every
      fresh checkout and every new worktree.

## 4. `col.reference` resolution — only when a consumer appears

Cut from the storage API workstream: ten `col.reference` columns exist and
**nothing resolves any of them**, so a resolver would have been a feature with no
reader.

Two constraints for whoever picks this up:

- **Do not call it `populate`.** That name already means content-relationship
  population (`entries/internal/populate.ts`), which is a different mechanism
  over a table that is itself being redesigned into a derived index. Use
  `resolveRefs` / `withRefs`.
- The cross-scope case is the actual design problem: a plugin needs a handle to
  core's resolver while remaining unable to address core tables. "Core resolves
  it" is a policy, not a mechanism.

Likely first consumer: admin rendering "created by …" on an entry list.
