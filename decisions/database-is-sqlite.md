---
area: data
---

# The database is SQLite

Astromech runs on libSQL (local files and Turso) and D1, so every migration, plugin journal and search index speaks one dialect.

**Why:** Turso sits in the Vercel Marketplace beside Neon, so no serverless host needs Postgres; Ghost, WordPress and PocketBase also ship one engine.

**Rejected:** Postgres (doubles every migration, journal and CI database; revisit after 1.0); MySQL (no partial indexes).
