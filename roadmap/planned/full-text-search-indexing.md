# Full-Text Search Indexing

**Direction is locked:** a derived **FTS5 external-content index**, kept in
sync by triggers, not a `search_index` column queried with `LIKE`.
`DECISIONS.md` has the reasoning and the rejected alternatives: no surveyed CMS
searches its content tables at scale, external content stores no second copy of
the text, and ranking, prefix matching and snippets come with FTS5.

## Waiting on a decision: D1 export

Cloudflare's import and export page says: "Export is not supported for virtual
tables, including databases with virtual tables. As a workaround, delete any
virtual tables, export, and then recreate virtual tables." Any FTS5 design
therefore stops `wrangler d1 export` working for every D1 site, and Astromech's
own backups are already unavailable on D1
(`apps/docs/configuration/database.md`). Checked on 2026-09-15.

Choices:

- FTS5 on every driver, documenting the drop, export and recreate steps (and
  perhaps a CLI command that does them).
- FTS5 on libSQL only, with D1 keeping `LIKE` search behind the same public
  contract.
- Defer full-text search.

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

So the plan amends the decision with two columns on `entry_content`:

- `searchText`, the plain text of the searchable fields, written by the app in
  the same statement as the row (atomic on D1, which has no transactions);
- `searchKey`, a stable integer with a unique index, set by the insert trigger.

The FTS table is external content over `title`, `slug` and `search_text` with
`content_rowid='search_key'`, and its triggers never change when the config
does. Rich text contributes its text leaves, one space per block; nested
`group`, `repeater` and `blocks` fields are walked. The walk has to descend into
named groups rather than read only the top-level keys: a named `tab` or
`accordion` stores its fields in one, so a site's top-level text can sit at
`seo.title`. `searchable` itself is refused below a nested field, so a default
that widens it must decide what it means for those fields.

Trash is filtered through the existing join to `entries` in the query, not by
gating the triggers (`deletedAt` lives on `entries`, and trash never touches
content rows), so a restore needs no reindex. Staged rows are indexed and
filtered out by the existing `stagedFor IS NULL`.

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
4. [ ] The query: `search` (and `_search` as its alias) becomes a `MATCH` in
       the shared rows and count predicate, with each token quoted and a prefix
       `*` on the last; ranked by `bm25`, title weighted highest, when no sort
       is given. Custom-table types, users and media keep `LIKE`.
5. [ ] `astromech entries:reindex [--check]`: recompute `searchText`, run
       `'rebuild'`; `--check` runs `integrity-check` and compares `searchText`.
6. [ ] Docs: `DECISIONS.md` (the amendment), `ARCHITECTURE.md`, `apps/docs`.

Search changes from substring to token and prefix matching: "ogr" stops
finding "blogroll".

## Open questions, with the planning pass's recommendation

- **`searchable` default:** true for `text`, `textarea` and `richtext`, with
  `searchable: false` excluding a field. The flag already exists as an opt-in
  for custom tables and for showing the admin's search box, so this widens it.
- **Tokenizer:** `unicode61 remove_diacritics 2` with prefix indexes, no
  porter, since porter stems only English and one table holds every locale.
- **The public contract** stays "entries are searchable". The SQLite-specific
  query, rank and escaping live in one `entries/repository/search.ts`, so a
  Postgres driver can build a tsvector from the same `searchText`.
