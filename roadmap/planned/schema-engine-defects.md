# Schema engine defects found by the property tests

Found by the property tests added in stage 5 of
[test-suite-review](../in-progress/test-suite-review.md), under
`packages/schema-engine/tests/`. Each is an expected failure (`it.fails`) until
fixed.

- [ ] **A table's dump differs after a fast-path `ADD COLUMN`.** SQLite stores
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
- [ ] **An added column lands last.** `diffTable` in
      `packages/schema-engine/src/diff.ts` puts every new nullable column on
      the `ADD COLUMN` fast path wherever it sits in the column list, and SQLite
      appends it. The README calls column order part of the contract. Rebuild
      the table when an added column is not last, or relax the contract.
- [ ] **`renderLiteral` writes `NaN`, `Infinity` and `-Infinity` as bare
      words.** In a `SELECT` SQLite fails; in a `DEFAULT` on a `real` column it
      silently stores the text `'NaN'`; `-Infinity` is a syntax error. Refuse
      them, or render them as SQLite can store them.
- [ ] **`renderLiteral` breaks on a NUL in a string.** SQLite stops reading at
      the NUL and fails with `unrecognized token`. It fails loudly, so it is
      not an injection risk.
