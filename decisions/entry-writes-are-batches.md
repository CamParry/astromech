---
area: data
---

# Every entry write is a batch

Each mutating entry method takes `id` or `ids`, as Payload's Local API takes `id` or `where`, so single and explicit-id writes are both atomic (`packages/astromech/src/entries/internal/from-batch.ts`).

**Rejected:** an `update`/`updateMany` split (Prisma); `id: string | string[]` (REST renames it to `ids` anyway).
