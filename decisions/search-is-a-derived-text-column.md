---
area: data
---

# Search is a derived text column

Each content row carries the plain text of its searchable fields, searched by the database's own engine (FTS5 on SQLite and D1), as Craft does ([full-text-search-indexing](../roadmap/planned/full-text-search-indexing.md)). The D1 export skips the search tables, which `wrangler d1 export` refuses, and restore rebuilds them.

**Rejected:** our own inverted index (Drupal, Relevanssi; we would own ranking); FTS5 with `LIKE` on D1 (answers differ per driver); `LIKE` over a copy (Payload's plugin).
