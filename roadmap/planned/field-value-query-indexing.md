# Field-Value Query Indexing

Filtering and sorting entries by a value inside their own field data — "all
posts where `featured` is true", "products ordered by `price`".

**Direction is locked:** per-field **declared expression indexes** over
`json_extract(fields, '$.path')`, with the index DDL and the query SQL emitted
from one declaration.
`DECISIONS.md` has the
reasoning, the fourteen-CMS survey behind it, and the rejected alternatives
(promoted generated columns, a typed lookup table, allowing unindexed JSON
filtering). Table-backed entry types remain the ceiling for a type that
outgrows the shared table.

## The state today (all verified)

- `where` on entries is a hardcoded allow-list — `locale`, `_search`, `status`,
  `slug`, `title`, `id`, `references` (`entries/repository/built-in.ts`). Anything
  else throws `UnknownWhereKeyError`
  (`DECISIONS.md`), and that stays: querying a
  field with no declared index must throw naming the field path and the
  remediation, never silently full-scan. On D1 an unindexed scan is billed per
  row read against a single-threaded database, so a silent slow success is
  materially worse than an error.
- Sorting is a six-name allow-list, `SORTABLE_FIELDS` (`built-in.ts`); anything
  else throws `UnknownSortKeyError`, on the same reasoning as the unknown
  `where` key. Ordering by
  an indexed field is part of this item.
- No JSON path handling exists anywhere — a repo-wide grep for `json_extract` /
  `->>` / `jsonb` / `json_each` returns zero hits outside `node_modules`.
- Table-backed entry types forward `where` into the repository's full
  operator DSL and throw on unknown keys (`entries/repository/table.ts:289-302`).

## The shape

A field opts in where it is declared, and one declaration drives everything:

- the `CREATE INDEX` DDL over `json_extract(fields, '$.path')`, typed by the
  field's declared kind so comparisons behave;
- the `WHERE` / `ORDER BY` expression the query builder emits.

The two must come from the same source because SQLite's planner matches an
expression index by **text, not algebra** — an index on
`json_extract(fields,'$.a')` will not serve `WHERE fields->>'$.a' = 1`, and
Craft's case-sensitivity defect (craftcms/cms #15370) is what hand-written
expressions on one side look like in production. No hand-written extraction
expressions anywhere.

- [ ] Declaration surface: how a field marks itself queryable (and sortable) in
      the config, and what the loud error for an undeclared field says.
- [ ] `schema-engine` support: `diff.ts:300-306` hard-errors on any index column
      that isn't a real column, and `ColumnRuntime` has no expression kind
      (`database/define-table.ts:58-77`). Partial indexes are already
      expressible; expression indexes are the gap.
- [ ] Query builder: emit the declared expression for `where` / `sort` on a
      declared field; keep throwing for undeclared ones.
- [ ] Multi-valued fields (arrays) are out of scope — SQLite has no multi-value
      index; an array of references is the relationships index's job.
- [ ] Postgres (planned driver) wants a genuinely different strategy (GIN
      `jsonb_path_ops`). The public contract stays "declared, per-field, typed
      indexes" so the asymmetry never reaches the API.

## Also riding this mechanism

- [ ] **Indexed field uniqueness.** `{ unique: true }` resolves to
      `FieldLookups.isUnique`, which today scans candidate rows in memory
      (`entries/lookups.ts`). SQLite supports **unique expression indexes**, so
      uniqueness is the same declaration with a `UNIQUE` qualifier rather than a
      second bespoke strategy. One deliberate decision to carry over: the
      built-in repository's `list` filters `stagedFor IS NULL`, so staged rows are invisible
      to today's scan — the indexed replacement must decide whether to keep
      that (a partial index can).

## Prerequisite it shares with relationships

Visibility predicates run **post-fetch in JS**
(`entries/operations/query.ts:84-104`), so `total` and `pages` are already
wrong for scheduled content — a bug documented in a comment at
`query.ts:48-53`. `status`, `publishedAt` and `deletedAt` are all real columns
and trivially pushable into SQL. Any new filtering makes the existing miscount
much more visible.
