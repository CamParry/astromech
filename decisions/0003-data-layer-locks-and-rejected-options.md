# 0003 — Data layer: what was locked, and what was rejected

**Date:** 2026-08-03
**Status:** accepted

Homegrown, total migration generator (no Atlas or drizzle-kit), no rename detection ever (rename = drop + add), SQLite full-table rebuild using `defer_foreign_keys` not `foreign_keys=OFF`, errors at generate time and warnings for destruction but never prompts, generation Node-only while application runs through Kysely's `Migrator`, schema 100% generated and data 100% hand-authored, plugins ship self-contained journals; rejects the `findMany(qb => …)` builder callback (use `query()`) and `populate` of `reference` columns (no consumer, name collision; future version must be called `resolveRefs`/`withRefs`), plus the repository layer.
