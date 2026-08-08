# Field-Value Query Indexing

Filtering and sorting entries by a value inside their own field data — the equivalent of a
WordPress `meta_query`. "All posts where `featured` is true", "products ordered by `price`".

**Status:** deferred 2026-07-30. Split out of `relationships-model.md` to keep that work
relationship-focused. Direction below is researched but NOT locked — it needs its own grilling pass.

## Why it's a separate feature

It shares a motivation with the relationships index ("query content by something other than the
columns we happen to have") but **not a mechanism**. Relations need a derived polymorphic edge
table because reverse lookup is multi-valued and cross-type. Scalar field values need neither, and
the two should not be unified into one EAV table — that reinvents `postmeta`.

## The state today (all verified)

- `where` on entries is a hardcoded allow-list — `locale`, `_search`, `status`, `slug`, `title`,
  `id`, `references` (`entries/storage/built-in.ts`). Anything else throws `UnknownWhereKeyError`,
  so `where: { featured: true }` is now a loud failure rather than a silent full result set
  (`decisions/0029-an-unknown-where-key-throws.md`).
- Sorting is a six-name allow-list, `SORTABLE_FIELDS` (`built-in.ts:62-69`); anything else is
  dropped and falls back to `createdAt desc`. **This one is still a silent drop** — the sort
  equivalent of what 0029 fixed for filters, and worth closing on the same reasoning.
- No JSON path handling exists anywhere — a repo-wide grep for `json_extract` / `->>` / `jsonb` /
  `json_each` returns zero hits outside `node_modules`.
- Table-backed entry types forward `where` into the storage wrapper's full operator DSL and throw
  on unknown keys (`entries/storage/table.ts:288-295`). The two storage shapes now agree that an
  unrecognised filter is an error, though not yet on which filters they accept.

The separable silent-drop half is **done**. What is left here is the feature itself: making a
filter on a declared scalar field actually work, rather than fail.

## Direction (researched, not locked)

**Declared, promoted fields materialised as generated columns with an index.** Not an EAV
side table, not undeclared blob querying.

```sql
ALTER TABLE entries ADD COLUMN f_featured AS (json_extract(fields,'$.featured'));
CREATE INDEX idx_entries_featured ON entries(type, f_featured) WHERE type = 'post';
```

- **Both libSQL and D1 document generated columns and indexes on them.** D1 has a dedicated
  reference page using `json_extract` as its worked example.
- **No sync code at all** — the database maintains it. This is the decisive advantage over a
  derived value table, which would need write-time traversal, a rebuild command and a drift
  detector (all of which the relationships index needs anyway, but this wouldn't).
- Generated columns carry a **declared type and collation**, which fixes the affinity trap where
  one entry saved `"100"` and another `100` and `> 100` silently skips the string rows.
- The query builder references a **stable column name**, sidestepping SQLite's expression-index
  text-matching rule (an index on `json_extract(fields,'$.a')` will not serve
  `WHERE fields->>'$.a' = 1` — the planner compares expression text, not algebra).
- Columns added via `ALTER TABLE` must be `VIRTUAL`; `STORED` needs a table rebuild, which the
  migration generator does anyway for most changes.

### Prior art

Nobody successfully queries an _undeclared_ JSON blob. Everyone either materialises real columns
(Payload flattens with underscores; Directus; Craft 4) or maintains a proprietary index with a
published optimizable-filter grammar (Sanity — non-optimizable filters load every document into
memory). Directus **removed** `_contains` on JSON in 9.15 citing per-database syntax divergence.
Strapi JSON filtering is a years-open feature request. Craft's trajectory is the instructive one:
EAV → per-field columns → a single JSON column, with explicit opt-in indexes at every stage.

`postmeta`'s documented failure modes (WP Trac #20134, #45354) are worth keeping on file: every
`meta_query` clause adds a self-join on one huge table; `meta_value` is LONGTEXT so it can only be
prefix-indexed; numeric comparison needs a `CAST` that discards the index; `NOT EXISTS` clauses
can't use an index at all.

### Ergonomics

Firestore's model — **fail loudly at the point of the query with the exact remediation attached**.
Querying a non-promoted field must throw naming the field path and the command to promote it, never
silently full-scan. On D1 an unindexed scan is billed per row read against a single-threaded
database, so a silent slow success is materially worse than an error.

## Also waiting on this

- [ ] **Indexed field uniqueness.** `{ unique: true }` resolves to `FieldReads.isUnique`, which
      today scans candidate rows in memory (`entries/reads.ts`). It wants exactly the mechanism
      above — a promoted column with an index — so it moved here from the field-validation
      roadmap rather than committing to a second, bespoke JSON-index strategy first. Note the
      uniqueness scan has an extra constraint the query case doesn't: built-in storage's `list`
      filters `stagedFor IS NULL`, so staged rows are invisible to it, and any indexed
      replacement has to decide deliberately whether to keep that.

## Open questions

- [ ] **D1's 100-column-per-table cap.** `entries` is one shared polymorphic table, so promoted
      columns from every entry type accumulate in it. Is "you've outgrown it, make it a table-backed
      type" an acceptable ceiling?
- [ ] **Column naming.** By path alone (`f_price`) shares a column across types and breaks when two
      types disagree on the value's type; by path+type (`f_product_price`) is safe but burns the
      column budget several times faster. Possibly path + declared kind (`f_price_num`).
- [ ] **Adding a queryable field becomes a migration.** That is the real ergonomic cost. Acceptable?
- [ ] `schema-engine` cannot express this today — `diff.ts:289-297` hard-errors on any index column
      that isn't a real column, and `ColumnRuntime` has no generated/computed kind
      (`database/define-table.ts:58-77`). Partial indexes _are_ already expressible.
- [ ] Multi-valued fields (arrays) can't be indexed this way — SQLite has no multi-value index.
      Out of scope, or does it fall back to the relationships-style edge index?
- [ ] Postgres wants a genuinely different strategy (GIN `jsonb_path_ops` indexes the whole document
      with no declaration — the thing SQLite fundamentally cannot do). Keep the public contract to
      "declared, per-field, typed indexes" so the asymmetry never reaches the API.
- [ ] Interaction with `full-text-search-indexing.md`, which wants a derived search column that a
      generated column _cannot_ produce (it needs field concatenation and rich-text stripping).

## Prerequisite it shares with relationships

Visibility predicates run **post-fetch in JS** (`entries/operations/query.ts:85-105`), so `total`
and `pages` are already wrong for scheduled content — a bug documented in a comment at
`query.ts:41-45`. `status`, `publishedAt` and `deletedAt` are all real columns and trivially
pushable into SQL. Any new filtering makes the existing miscount much more visible.
