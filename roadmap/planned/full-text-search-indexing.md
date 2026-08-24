# Full-Text Search Indexing

**Direction is locked:** a derived **FTS5 external-content index** over the
entries table, kept in sync by triggers — not a `search_index` column queried
with `LIKE`. `DECISIONS.md` has the
reasoning and the rejected alternatives; the short version is that no surveyed
CMS searches its content tables at scale, FTS5 external-content stores no
second copy of the text (it reads row content from `entries` on demand), and
ranking, prefix matching and snippets come with it.

- [ ] FTS5 virtual table with `content='entries'`, porter/unicode61 tokenizer,
      covering the fields flagged searchable.
- [ ] `searchable?: false` per field in `FieldConfig` to exclude fields from the
      index — the flag name is established vocabulary (Craft, EmDash, TinaCMS,
      Apostrophe all use it).
- [ ] Triggers keep the index in sync on insert/update/delete, gated so
      soft-deleted rows drop out of the index.
- [ ] The index is derived and rebuildable: `astromech entries:reindex` CLI
      command for backfilling, plus an integrity check that detects trigger
      drift rather than trusting it.
- [ ] Switch `_search` to query the FTS index.
- [ ] The public contract stays "entries are searchable", never "there is an
      FTS5 table" — Postgres (a planned driver) wants tsvector+GIN, and the
      asymmetry must not reach the API.
