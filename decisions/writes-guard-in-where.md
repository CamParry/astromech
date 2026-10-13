---
area: data
---

# A write repeats its checks in its `WHERE`

A write carries what it read as a guard the repository compiles into its `WHERE`, and answers 409 when no row matches (`packages/astromech/src/content/write-guard.ts`; D1's gaps are in [d1-content-writes-as-one-batch](../roadmap/proposed/d1-content-writes-as-one-batch.md)). Guards are internal: no public method takes a precondition.

**Why:** another call can change the row between read and write.

**Rejected:** re-reading inside the transaction (D1 has none); a row lock (SQLite has none); version checks on update (Ghost, Contentful; [editor locking](../roadmap/planned/editor-locking.md) uses a lock).
