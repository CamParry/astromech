# Flatten the user and media operations

Apply the shape `flatten-entry-operations.md` established for `entries/` to the
`users/` and `media/` domains: bring their writes onto the scoped `transaction()`
(`DECISIONS.md`), drop the
hand-threaded `db` handle, and make each row write atomic with its
relationship-index write. The entries work (commits under that roadmap) is the
worked example; read it first.

## What is still threaded

Both domains still pass a transaction handle by hand, the pattern 0080 removes
from `entries/`:

- `users/repository.ts` and `media/repository.ts` each take a `db` parameter
  "to scope it to a transaction" and call
  `createRelationshipRepository(db ?? getDb()).deleteByResource(id, …)` on
  delete. With the scope, this is `createRelationshipRepository()` and the `db`
  parameter goes.
- The relationship-index writers (`users/internal/relationships.ts`,
  `media/internal/relationships.ts`) already call `createRelationshipRepository()`
  with no handle, so they join a scope once the callers open one.

## The work

- [ ] `users/repository.ts`, `media/repository.ts`: drop the `db` parameter from
      `delete` (and any sibling that carries it); call
      `createRelationshipRepository()` and let `getDb()` resolve the scope.
- [ ] `users/operations/` (`create`, `update`, `delete`) and `media/operations/`
      (`upload`, `replace`, `update`, `delete`): wrap each row write and its
      relationship-index write in one `transaction()`, so neither is left without
      the other. This is the same atomicity fix Stage 5 made for entries.
- [ ] Confirm no `db`/`txRepository` parameter remains in either domain's write
      path; a function that seems to need one is answered by the scope, per 0080.
- [ ] Gate, plus `pnpm run check:boot`. Add atomicity tests mirroring the
      `*-atomicity.test.ts` files in `packages/astromech/tests/services/entries/`
      where a write path gained a transaction.

## Rules

Same as `flatten-entry-operations.md`: one exported function per operation,
written top to bottom; each row fetched once; `transaction()` wraps the writes
only; no `db` parameter anywhere; the comment contract
(the `code` skill). Users and media fire no hooks today
(only `entry:*` events exist, `DECISIONS.md`),
so these operations are load, then a transaction around the writes — no
before/after hook loop.

## Not changing

- The repository layer below each domain's repository, and the relationship
  index (`DECISIONS.md`), unchanged.
- D1 still degrades sequentially, per `DECISIONS.md` and
  `apps/docs/configuration/database.md`.
