# Custom-Table Relations

An entry type with a custom table (`tableRepository`) took part in the
relationships index, but not symmetrically. This file reviewed what worked,
what was refused, and where the code and the docs disagreed, and decided each
open question. Working through them turned up four more defects, fixed here
too.

## Outcome

- **The `references` filter works on a custom-table type.** The custom-table
  `list` ANDs an `EXISTS` against the relationships index onto its one
  predicate, correlated on the table's id column and matched on `sourceType`,
  which `idx_rel_filter` serves. `RelationshipFilterUnsupportedError` is gone,
  so the question of its message no longer arises.
- **The pruning docs were wrong, and so was the code for updates.** A target
  stored in its own table was checked on create but skipped inside a
  transaction, so an update never pruned one. `tableRepository` reads through
  `getDb()`, which answers the open transaction first, so the skip guarded
  nothing and is deleted. `apps/docs/content/relationships.md` now says a
  target stored in its own table is checked against that table.
- **A custom table's id column must be `col.id()`.** Both sides of the index
  match on an id alone, so integer ids in two custom tables corrupted each
  other's edges. `tableRepository` refuses any other id column.
- **A query naming several types refuses a custom-table type among them.** The
  whole query went to the first type's repository, so the other side's rows
  went missing without an error. The admin command palette sent plugin types
  in one list; it now queries each custom-table type on its own.
- **A caller's bad query answers 400.** An unknown `where` or `sort` key, a bad
  `references` filter and the cross-type refusal answered 500 over REST and
  RPC. The central handler in
  `packages/astromech/src/transport/http/middleware/errors.ts` maps all four.

## The work

- [x] Decide whether the `references` filter is supported for custom-table
      types. Supported, in `packages/astromech/src/entries/repository/table.ts`.
- [x] Reconcile the pruning docs with the code. The code was wrong on update
      and the docs on every case; both are fixed.
- [x] Decide whether the refusal error is clear enough. Moot: the refusal is
      gone.
- [x] `DECISIONS.md` records why every id in the relationships index is unique
      across resources.
