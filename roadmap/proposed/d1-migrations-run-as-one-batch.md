# D1 migrations run as one batch

On D1, a migration that rebuilds a table other rows point at fails at its
`DROP TABLE`. On libsql the same migration works, because the driver runs the
migration chain in one transaction (`DECISIONS.md`, "A libsql migration run is
one transaction"). D1 has no interactive transactions, so Kysely's `Migrator`
runs each statement of `up(db)` on its own, and `PRAGMA defer_foreign_keys`
ends with the statement that set it. The open item in
[schema-engine-defects](../planned/schema-engine-defects.md) has the history.

## Evidence

Tested on D1 on 2026-10-02:

- D1 ignores `PRAGMA foreign_keys = OFF`, so SQLite's 12-step rebuild (keys off,
  rebuild, `foreign_key_check`, keys on) cannot run there.
- Sent statement by statement, the rebuild fails at `DROP TABLE` while a row
  points at the table.
- Sent as one `batch()`, `PRAGMA defer_foreign_keys = on`, the rebuild, then
  `PRAGMA defer_foreign_keys = off` commits, and `PRAGMA foreign_key_check`
  still reports a real dangling reference. Cloudflare documents this pattern.

## Options

- **Send each migration's statements as one `batch()`**, with its ledger row,
  as `wrangler d1 migrations apply` does. The runner then needs the statements
  before it runs any of them, which `up(db)` does not give: a migration file
  would also export its statements as data (or D1 gets `.sql` files), and the
  generator writes both forms.
- **A driver that buffers writes and sends them as one batch** when the
  migration ends. It is not a drop-in under `Migrator`: `Migrator` reads its
  ledger (`kysely_migration`) inside the run, and the generated foreign key
  check, like any hand-authored data migration (`0001_entry_content`), reads
  rows before it writes. A buffered read has no result to return.
- **A D1 migration runner of our own**, beside `migrateToLatest`, that keeps
  the `kysely_migration` ledger so a site can move between drivers.

## Open questions

- How a batch fails on a dangling reference. The libsql migration throws from
  JavaScript after reading `PRAGMA foreign_key_check`; inside one batch the
  check has to abort the batch itself, for example by inserting its rows into
  a table whose `CHECK` refuses any row. Whether D1 allows
  `pragma_foreign_key_check` as a table-valued function is untested.
- What a hand-authored migration that reads data looks like on D1, and whether
  it may only run as a list of statements.
- D1's limits on one batch (statement size, run time) against a rebuild of a
  large table.
- Whether plugin chains, which merge into the app chain at apply time, can
  batch the same way.

## Content writes D1 leaves partial

The same missing transaction leaves gaps in content writes. Each write's first
statement carries its guard (`DECISIONS.md`, "A write repeats its load-step
checks in its own `WHERE`"), so a refused write changes nothing, but:

- **Earlier items of a multi-id call stay written.** `writeBatch` runs inside
  `transaction()`, which on D1 runs with none, so when a later id fails (a 409,
  a 422) the ids in `BulkOperationError.succeededBefore` keep their writes.
- **A snapshot written before a refused update stays.** The version snapshot
  and the update are two statements; a row changed between them refuses the
  update and leaves a version identical to the row as it stood.
- **Two interleaved updates can snapshot the same state.** Both snapshots can
  read the row before either update lands, so two versions hold the same
  content and the state between the updates is never versioned.

Sending the snapshot and the update as one `batch()` would close the last two.

## Why it matters soon

The permissions work drops the unused `roles` table
([permissions](../planned/permissions.md)). `users` has no foreign key to
`roles` (its `role` column is plain text), so that drop is a plain
`DROP TABLE`. But any change there that rebuilds `users` rebuilds the table
most rows point at: sessions, accounts, content rows, versions and
notifications, all through `cascade` or `set null` keys. The differ refuses
that rebuild (the `DROP TABLE` fires those actions), so it is hand-authored,
and on D1 it fails as above.
