---
milestone: 1.0
---

# Full-Text Search Indexing

> **Follows `roadmap/planned/drafts.md`** (decided 2026-10-03): staged changes become drafts in their own table, so revise the staging parts of this file before building it.

**Direction, decided 2026-10-02** (`DECISIONS.md`, "Search is a derived text
column searched by the database's own engine"): Craft's shape. Each content row
carries the plain text of its searchable fields, and the database's own
full-text engine searches it: an FTS5 external-content index on SQLite and D1,
a `tsvector` GIN index on Postgres when that driver comes. Search today is
`title LIKE ? OR slug LIKE ?` (`entries/repository/entries-table.ts`) and reads
no field at all.

Prior art: Craft keeps a derived `searchindex` table searched by MySQL
`FULLTEXT` or a Postgres `tsvector`; EmDash uses FTS5 per collection and has no
search on Postgres; Drupal core, Relevanssi and SearchWP keep their own
inverted index in plain tables; Payload's search plugin copies fields into a
`search` collection queried with `like`. Rejected: our own inverted index,
which keeps D1 export working but leaves ranking, snippets and phrase matching
for us to write and maintain; FTS5 on libSQL only with `LIKE` on D1, which
answers the same query differently per driver; and `LIKE` over a copied
column.

## D1 export, tested 2026-10-02

On a throwaway remote D1 database, with wrangler 4.125.0 and 4.147.0:

- A full `wrangler d1 export` fails once an FTS5 table exists: `D1 Export
error: cannot export databases with Virtual Tables (fts5)`. So does
  `--no-data`. The database stays usable afterwards (workers-sdk #9519 reports
  a lockout; it did not happen).
- `--table=<name>`, repeated for several tables, works, and with `--no-schema`
  exports data only. A per-table export leaves out separate indexes and
  triggers.

Migrations own the schema, so the `astromech` CLI's D1 export exports every
table but the search ones as data only, and its restore runs the migrations on
a fresh database, imports the data and rebuilds the index. Site owners never
run `wrangler d1 export` by hand. D1's own backup, Time Travel, is unaffected
by virtual tables. Column order is not part of the schema contract, so the
restore must name each table's columns when it imports the data, or rely on
`wrangler d1 export` writing them.

## Design, from a planning pass on 2026-09-15

The index sits over `entry_content`, not `entries`: `entries` has no text
columns, and `title`, `slug` and `fields` live on `entry_content`.

Pure external content over the existing columns does not work, for two reasons:

- `entry_content.id` is text, so FTS5 would key on SQLite's implicit rowid,
  which `VACUUM` (and the libsql driver's `VACUUM INTO` backup) may renumber
  and a schema-engine rebuild does not copy.
- The text is inside the JSON `fields` column, and which fields are searchable
  lives in the site's config. A trigger calling `json_extract` would put config
  into DDL that is generated from config-free `CORE_TABLES`, and would index
  TipTap's JSON keys.

So `entry_content` gains two columns:

- `searchText`, the plain text of the searchable fields, written by the app in
  the same statement as the row (atomic on D1, which has no transactions);
- `searchKey`, a stable integer with a unique index, set by the insert trigger.

The FTS table is external content over `title`, `slug` and `search_text` with
`content_rowid='search_key'`, and its triggers never change when the config
does. Rich text contributes its text leaves, one space per block; nested
`group`, `repeater` and `blocks` fields are walked. The walk has to descend into
named groups rather than read only the top-level keys: a named `tab` or
`accordion` stores its fields in one, so a site's top-level text can sit at
`seo.title`. The flag must also decide what it means for a field below a nested
field, where `translatable` is refused.

Trashed and staged rows are indexed and filtered out in the query, by the
`entry_content.trashed` flag ([trashed-entry-slug-collision](../completed/trashed-entry-slug-collision.md)) and by
the existing `stagedFor IS NULL`, so a restore needs no reindex.

Settled in the same pass:

- **`searchable` defaults to true** for `text`, `textarea` and `richtext`;
  `searchable: false` excludes a field.
- **Tokenizer:** `unicode61 remove_diacritics 2` with prefix indexes, no
  porter, since porter stems only English and one table holds every locale.
- **The public contract** stays "entries are searchable". The SQLite-specific
  query, rank and escaping live in one `entries/repository/search.ts`, so a
  Postgres driver can build a `tsvector` from the same `searchText`.

## Steps

1. [ ] Schema engine: an optional named "derived DDL" kind (virtual tables and
       triggers) in the snapshot, diffed by name and SQL, re-emitted after a
       table rebuild, kept by `db:rebaseline --collapse`, and covered by the
       parity oracle.
2. [ ] Core schema: the two columns, the FTS table and triggers, the demo and
       Cloudflare migrations and snapshots, and a libsql restore that skips the
       FTS shadow tables and runs `'rebuild'`. These land together.
3. [ ] Text extraction in `fields/`, written as `searchText` on every content
       write.
4. [ ] The query: `search` becomes a `MATCH` in the shared rows and count
       predicate, with each token quoted and a prefix `*` on the last; ranked
       by `bm25`, title weighted highest, when no sort is given. Users and
       media keep `LIKE`.
5. [ ] `astromech entries:reindex [--check]`: recompute `searchText`, run
       `'rebuild'`; `--check` runs `integrity-check` and compares `searchText`.
6. [ ] D1 export and restore in the `astromech` CLI, as above.
7. [ ] Docs: a `DECISIONS.md` entry for the design as built, `ARCHITECTURE.md`, `apps/docs`.

Search changes from substring to token and prefix matching: "ogr" stops
finding "blogroll".
