# Schema engine defects found by the property tests

Found by the property tests added in stage 5 of
[test-suite-review](../completed/test-suite-review.md), under
`packages/schema-engine/tests/`. Each is an expected failure (`it.fails`) until
fixed.

- [x] **A table's dump differs after a fast-path `ADD COLUMN`.** SQLite stores
      the change as `… NOT NULL , \`c1\` text)`where a fresh build gives
`… NOT NULL, \`c1\` text )`, and `normalize()`in
`packages/schema-engine/src/oracle.ts`does not reconcile them. It
 happens only on a table with no table-level constraint (with a foreign
 key or composite key, SQLite inserts the column before`CONSTRAINT`and
 the dumps match). Five core tables have none:`users`, `roles`,
 `verifications`, `\_astromech_cron`, `\_astromech_plugins`. The first
 generated migration that adds a nullable column to one of them fails
 `packages/astromech/tests/database/baseline-ddl-parity.test.ts`, and a
 site using `dumpSchema` as its drift gate, as the README suggests, hits
      the same.
- [x] **An added column lands last.** `diffTable` in
      `packages/schema-engine/src/diff.ts` puts every new nullable column on
      the `ADD COLUMN` fast path wherever it sits in the column list, and SQLite
      appends it. The README calls column order part of the contract. Rebuild
      the table when an added column is not last, or relax the contract.
      Fixed by relaxing the contract (`DECISIONS.md`, "Column order is not part
      of the schema contract"): `dumpSchema` lists columns by name, which also
      fixes the dump above, and the libsql restore names its columns.
- [x] **`renderLiteral` writes `NaN`, `Infinity` and `-Infinity` as bare
      words.** In a `SELECT` SQLite fails; in a `DEFAULT` on a `real` column it
      silently stores the text `'NaN'`; `-Infinity` is a syntax error. Refuse
      them, or render them as SQLite can store them.
- [x] **`renderLiteral` breaks on a NUL in a string.** SQLite stops reading at
      the NUL and fails with `unrecognized token`. It fails loudly, so it is
      not an injection risk.
- [ ] **Rebuilding a referenced table fails with foreign keys on.** Core runs
      with foreign keys on. Rebuilding a table that other tables' rows point
      at fails at commit: `defer_foreign_keys` does not clear the violation
      count the `DROP` adds. Dropping a referenced table together with the key
      pointing at it also fails, because the `DROP TABLE` runs before the
      rebuild that removes the key. Found by seeding the parity property.
- [x] **A moved column produces no ops.** Reordering a table's columns with no
      other change diffs as nothing, so the migrated table keeps the old order
      while a fresh build has the new one (the same contract as the
      added-column case above). No ops is now correct: column order is not
      part of the contract.
- [ ] Seeding the parity property also hit an SQLite 3.45.1 bug: on a populated
      table, adding a `real NOT NULL DEFAULT 1.5` column and then a column with
      a CHECK fails with "NOT NULL constraint failed". The property skips that
      case. It is a false positive in `PRAGMA integrity_check` from 3.42.0
      ([forum post ee4f6fa5ab](https://sqlite.org/forum/forumpost/ee4f6fa5ab)),
      fixed in 3.45.2 (check-in `60dccb23b1`); `@libsql/client` 0.18.0
      (`libsql` 0.5.29) still bundles 3.45.1, so sites on libsql hit it too,
      while `node:sqlite` 3.50.4 and the `sqlite3` CLI 3.51.0 run the case cleanly.
