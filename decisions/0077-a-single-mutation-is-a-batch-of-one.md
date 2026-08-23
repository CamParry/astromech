# 0077 — A single mutation is a batch of one; explicit-id batches are atomic

**Date:** 2026-08-20
**Status:** accepted; the shared batch primitive is superseded by 0080, the semantics stand

All mutating entry operations run through one heterogeneous transactional batch primitive; a single id is a batch of one, so single writes become atomic. Explicit-id batches are atomic, return rows, and travel in the request body. Best-effort `{ docs, errors }` reserved for filter-addressed ops; batch create deferred over intra-batch slug uniqueness. Rejected Prisma-style `update`/`updateMany` split. [Shared primitive superseded by 0080.]
