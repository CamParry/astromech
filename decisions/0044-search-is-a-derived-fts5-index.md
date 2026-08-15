# 0044 — Search is a derived FTS5 external-content index, not a column on `entries`

**Date:** 2026-08-10
**Status:** accepted

`roadmap/planned/full-text-search-indexing.md` proposed a `search_index` text
column on the entries table, queried directly. That shape is rejected in favour
of a **derived FTS5 external-content index**: a virtual table declared with
`content='entries'`, kept in sync by triggers, holding only the fields flagged
searchable. The roadmap file carries the build steps; this record carries the
why.

The same fourteen-CMS survey behind
`decisions/0043-field-queries-ride-declared-expression-indexes.md` showed total
convergence: **no system searches its content tables at scale.** Every one
maintains a derived text index — Craft's `searchindex` table (MySQL FULLTEXT /
Postgres tsvector+GIN, rebuilt per save by a queue job), Drupal's
`search_index`/`search_dataset` inverted index, Joomla's `#__finder_*` tables,
Apostrophe's weighted Mongo `$text` index, Umbraco's Lucene indexes, EmDash's
FTS5 external-content tables. The systems that skipped the derived index are
the cautionary tales: WordPress core's `LIKE '%term%'` over three columns and
Directus's `LOWER(col) LIKE '%term%'` over every string column are the two
documented worst performers in the survey (the Directus one degrades visibly at
~100k rows, directus/directus#24594), and both ecosystems route serious
installs to plugins or external engines.

## Why FTS5 external-content specifically

- **It is the native SQLite mechanism and it runs on D1 today** — EmDash, the
  closest architectural neighbour (TypeScript CMS on Astro + D1/libSQL), ships
  exactly this: `_emdash_fts_<x>` virtual tables with `content='ec_<x>'`,
  porter/unicode61 tokenizer, three triggers gated on soft-delete, and an
  integrity check at startup.
- **External content stores no second copy of the text** — the index holds the
  tokenised form only and reads row content from `entries` on demand, which
  matters on D1 where storage and row reads are billed.
- **Ranking, prefix queries and snippet/highlight come with it** — a
  `search_index` column queried with `LIKE` has none of these, cannot use an
  index with a leading wildcard, and re-implements what FTS5 already does.

## What was rejected

**A `search_index` column on `entries` queried with `LIKE`** — the roadmap
file's original shape. It is the WordPress/Directus anti-pattern with an extra
denormalised column, and the write-time cost (concatenate + strip rich text on
every save) is identical to feeding the FTS index, so the column buys nothing.

**Indexing rendered output** (Drupal core search, TYPO3 indexed_search). It
couples search coverage to the rendering layer — a field is searchable only if
a template happens to print it — and Astromech is headless-first; there is no
canonical rendered page to index.

**An external engine** (Meilisearch/Typesense/Algolia — where every surveyed
ecosystem eventually sends its big installs). Nothing stops a plugin from
shipping that later; core search staying in-database is what keeps the default
deployment one D1 database with no companion service.

## Carried into the design

- The per-field **`searchable` flag** is established vocabulary — Craft, EmDash,
  TinaCMS and Apostrophe all use exactly this word for exactly this opt-in/out.
- The index is **derived and rebuildable** — a reindex command is part of the
  feature, same as the relationships index, and trigger drift gets an integrity
  check rather than trust.
- The public contract stays "entries are searchable", never "there is an FTS5
  table": Postgres (a planned driver) wants tsvector+GIN, and the asymmetry
  must not reach the API — the same rule 0043 applies to expression indexes.
