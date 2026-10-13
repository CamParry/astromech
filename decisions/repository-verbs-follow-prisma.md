---
area: structure
---

# Repository methods use Prisma's verbs

Reads are `findOne` (the row or null), `findMany`, `count`, `findBy<X>` and `countBy<X>`; writes are `create`, `update`, `delete`, `upsert`, their `…Many` forms, `updateBy<X>` and `deleteBy<X>`, as in Prisma and TypeORM. A domain verb stays only for a conditional write whose condition is the rule (`claim`, `createIfEmpty`). Service methods keep their public names (`query`, `get`).

**Rejected:** `get` for a nullable read (`get*` throws everywhere else); `list`, `query` or `findAll` for one kind of read; `{ page, limit }` beside `{ limit, offset }`; a name that hides its condition (`insertFirstUser`).
