# 0077 — A single mutation is a batch of one; explicit-id batches are atomic

**Date:** 2026-08-20
**Status:** accepted

Every mutating entry operation runs through one transactional batch primitive. A
single id is a batch of one. A batch addressed by explicit ids is atomic and
returns the rows. Best-effort partial success is reserved for a filter-addressed
operation that does not exist yet.

## Context

update, delete, trash, and restore each hand-wrote the same dispatch:

```
if (Array.isArray(id))
    return runBulk(type, id, perItem)                     // one transaction
return perItem(getEntryRepository(type), undefined, id)   // no transaction
```

That shape had three faults. The branch was copied per operation. The single path
ran with `db` undefined, so a single update's row write and its relationship index
were not atomic, while a one-element array update was: the same logical work with
a different durability guarantee. And the two paths failed differently. The bulk
runner throws `BulkOperationError` naming the failed id and those that landed
before it; the single path throws the raw error.

Two product questions decided the shape, not the cleanup alone: whether a caller
ever needs different values per id (a Shopify-style edit grid), and how a multi-id
write looks over REST (where the ids go, and whether one bad id rolls the batch
back).

## What the field does

Grounded in the API guides and CMSs that document this:

| Target                        | Failure     | Returns            | Per-item values     |
| ----------------------------- | ----------- | ------------------ | ------------------- |
| Explicit ids, in the body     | Atomic      | the rows           | yes (heterogeneous) |
| Filter (`where`), unknown set | Best-effort | `{ docs, errors }` | no (one payload)    |

Explicit-id batches are atomic by convention: JSON:API atomic operations ("a
failure to perform any operation must invalidate any effects of preceding
operations"), Hasura `update_many` (one rolled-back transaction), Google AIP-234
("synchronous batch update must be atomic"), Directus `updateItemsBatch`.
Best-effort appears where the target is an unbounded filter (Payload's
`{ docs, errors }`), because rolling back an unknown-size set is risky and a
per-row error channel is needed. Nobody puts multiple ids in the path or query
string; explicit-id batches travel in the body. Heterogeneous per-item values are
supported by exactly the explicit-id systems, not the filter ones.

Astromech addresses writes by explicit id. So the matching conventions are atomic,
body-carried, rows returned, and heterogeneous-capable, which is also what the
bulk path already did.

## Decision

- **One primitive: a heterogeneous transactional batch.** A list of per-item
  operations, run in one transaction via the always-present `transaction`
  (`0076`), all-or-nothing, results returned in input order. `runBulk` becomes
  this, fed per-item edits rather than one payload plus many ids.
- **Single is a batch of one.** The single path stops being special. It opens a
  transaction like the batch, so a single update is now atomic on any driver that
  supports it, and it fails the same way a batch of one does.
- **Uniform bulk is sugar.** `{ ids, data }` expands to
  `ids.map(id => ({ id, data }))`. The public overloads stay: `id: string` returns
  an `Entry`, `id: string[]` returns `Entry[]`. No new public surface.
- **Explicit-id batches are atomic and return the rows.** One failure rolls the
  batch back. This is the current bulk behaviour, now the single behaviour too.
- **Multiple ids travel in the request body**, when the REST surface exists. The
  path stays single (`/entries/:type/:id`). A multi-id write is
  `PATCH /entries/:type` with the ids in the body.

## Reserved, not built

- **The per-item edit grid.** Different values per id (Directus `updateItemsBatch`,
  the Shopify grid) is a valid future addition: a `{ items: [{ id, data }] }`
  overload, or a REST body of `[{ id, ... }]`. The primitive already speaks that
  shape, so it is additive with no core change. Nothing in the product needs it
  yet, and a caller can loop single updates in the meantime.
- **Filter-addressed best-effort.** "publish everything matching this query",
  committing the good rows and returning `{ docs, errors }`, is a different
  operation with a different return type. If it is ever wanted it is a separate
  `where`-based method, not a mode bolted onto this one.
- **Batch create.** Valid in principle (Google AIP-233, Directus array POST,
  Hasura `insert_many`), but import- and script-driven, and neither exists. Create
  stays single-exposed. The real work it defers is intra-batch slug uniqueness:
  two new entries with the same title in one transaction need the second's
  uniqueness check to see the first, which the batch primitive alone does not
  give. Recorded here so a successor knows the trap.

## Rejected

- **Separate `update` / `updateMany` (Prisma).** Prisma splits them because they
  differ hard: `updateMany` returns a count and never throws on a missing row. Our
  batch is all-or-nothing and returns rows, so the semantic gap between single and
  bulk is small, and one overloaded method over a shared primitive beats doubling
  the surface (every status wrapper would need both forms).
- **Hardcode "one payload, many ids" as the primitive.** It cannot grow to the
  grid. The heterogeneous list costs nothing more today and keeps the grid
  additive.
- **Best-effort as the default for explicit ids.** Wrong convention (best-effort
  is the filter product) and unnecessary: a caller-supplied id list is small and
  known, so atomic rollback is cheap and expected.

## Consequences

- update, delete, trash, and restore migrate onto the shared primitive and drop
  their per-operation branch. The status wrappers (`publish`, `unpublish`,
  `schedule`) are unaffected; they delegate to `update`.
- Single writes become atomic where the driver supports transactions, closing the
  asymmetry. On a no-transaction driver they degrade with the batch, per `0076`
  and `0028`.
- Relationship index derivation (`0004`) is unchanged; it now always runs inside
  the batch transaction.
