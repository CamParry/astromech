# D1 content writes as one batch

On D1, `transaction()` runs its function with no transaction (`DECISIONS.md`,
"D1 degrades to sequential writes"), so a content write that spans several
statements can stop part way. Each write's first statement carries its guard
(`DECISIONS.md`, "A write repeats its load-step checks in its own `WHERE`"), so
a refused write changes nothing, but these gaps stay open. The migration side of
the same missing transaction is
[d1-migrations-run-as-one-batch](d1-migrations-run-as-one-batch.md).

## Gaps

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

## Tests

There is no `it.fails` test for these gaps. The core test harness runs on
libsql, where `transaction()` opens a real transaction and rolls each gap back;
reproducing one needs D1 itself or a test driver that reports no interactive
transactions, and neither exists yet.
