# 0044 — Search is a derived FTS5 external-content index, not a column on `entries`

**Date:** 2026-08-10
**Status:** accepted

Full-text search uses a derived FTS5 external-content virtual table (`content='entries'`, trigger-synced, per-field `searchable` flag), not a `search_index` text column queried with `LIKE`. Rejected that column (the WordPress/Directus anti-pattern), indexing rendered output, and an external engine for core.
