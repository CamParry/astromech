# 0080 — A transaction is a scope, not a handle passed by hand

**Date:** 2026-08-21
**Status:** accepted
**Supersedes:** 0076 (the method-on-the-repository point), 0055 (nesting throws), 0077 (the shared batch primitive; its semantics stand)

`transaction(fn)` is a function in `database/`, not a method on a repository. It
opens a Kysely transaction and stores the handle in an `AsyncLocalStorage` scope
for the duration of `fn`. `getDb()` returns that handle while the scope is open
and the base connection otherwise, so every repository is inside the transaction
without being told. Nothing takes a `db` or `txRepository` parameter.

This is .NET's `TransactionScope` ("ambient transaction") and Laravel's
`DB::transaction(fn)`: the closure is the boundary, and data access inside it
binds automatically.

## Context

`0076` made `transaction` a required method on `EntryRepository`, with the shape
`transaction((txRepository, db) => ...)`. The callback receives a repository
re-bound to the transaction and the raw handle, and has to pass that handle to
anything else that writes: `createRelationshipRepository(db)`,
`indexEntryRelationships(..., db)`, `pruneDanglingRelations(..., db)`. The
`(repository, db, id)` signature on every per-id callback in `internal/bulk.ts`
exists to carry it.

Threading the handle by hand has a failure mode the code already exhibits.
Forgetting it silently escapes the transaction: the comment at
`entries/repository/built-in.ts` warns that "inner writes escape the outer
rollback", and `duplicate`, `staging/create` and `versions/restore` call
`indexEntryRelationships` with no handle and no transaction, so their row write
and relationship-index write are not atomic. `0077` closed the same asymmetry
for update, delete, trash and restore; these three were missed because the
mechanism depends on every author remembering.

The handle was also the reason `transaction` had to build a second repository
per call (`createBuiltInEntryRepository({ db: trx })`), and the reason the per-id
work in every operation was lifted out into a callback instead of written inline.

## Decision

- **One function, `transaction(fn)`, in `database/`.** `fn` takes no arguments.
  When `supportsTransactions()` is false it runs `fn` once with no transaction,
  the degrade `0028` and `0076` committed to, gated on the same honest flag.
- **`getDb()` resolves the open transaction first.** The store is the only
  change to the registry. Every repository already resolves its handle per call
  through `getDb()`, so they join a transaction with no change.
- **Nesting joins.** A `transaction()` call inside an open scope runs `fn` in the
  outer transaction. `0055` made nesting throw because a nested call silently
  escaped; with the handle in scope it cannot escape, so the loud failure has
  nothing left to guard. Savepoints remain unbuilt, as `0055` left them.
- **Repository factories resolve the handle per call, never at construction.**
  `createRelationshipRepository(db = getDb())` and its siblings capture whatever
  `getDb()` returns when the factory runs. Constructed inside a scope that is the
  transaction, which is correct; constructed at module scope it would be the base
  connection forever. Each factory becomes `db?: Db` with `db ?? getDb()` per
  call, the shape `createRepository` already has, so a stale handle cannot be
  held. The optional `db` stays as a test seam only.
- **The batch loop is written inline in each operation.** `0077`'s semantics are
  unchanged: a single id is a batch of one, an explicit-id batch is atomic,
  results come back in input order, `BulkOperationError` names the failed id.
  What changes is the mechanism. Atomicity comes from wrapping the loop in
  `transaction()`, so the loop no longer needs a shared primitive to be atomic,
  and `runBulk` / `runOnIds` / `runOnIdsVoid` are deleted. The loop and its
  try/catch sit in the operation where a reader can see them.

## What must stay outside the scope

Plugin hooks and anything fire-and-forget run outside the `transaction()` call.
`before*` hooks fire before the scope opens so a veto costs no DB work; `after*`
hooks fire after it closes so a plugin never observes a write that rolled back.
An unawaited promise started inside the body would inherit the scope and write
on a handle that has already committed; the boundary is the closure, so keep the
closure to the writes. Should a caller ever need the base connection from inside
a scope, `AsyncLocalStorage.exit` gives an explicit, named escape; it is not
added until a caller exists.

## Checked

- Propagation through `await`, `Promise.all` and callbacks, and isolation between
  concurrent requests, are the guarantees `request-context` already relies on
  for `getCurrentUser()`.
- Cloudflare Workers: `AsyncLocalStorage` needs `nodejs_compat`, which
  `request-context` already requires. D1 degrades as before; a batch on D1 is
  still not atomic, and `apps/docs/configuration/database.md` states it.
- Kysely's `Transaction<DB>` extends `Kysely<DB>`, so the stored handle satisfies
  `Db` and nothing downstream changes type.
- A throw inside `fn` rejects `execute` and rolls back, so a
  `BulkOperationError` thrown mid-loop rolls back the batch as it does today.

## Rejected

- **Keep the explicit handle and audit every call site.** The audit already
  failed three times in one domain. A mechanism that is correct only when every
  author remembers a parameter is the wrong mechanism.
- **Savepoints for nested `transaction()` calls.** No operation needs partial
  rollback, and joining is one sentence to explain.
- **A transaction-aware repository that carries its own handle.** This is what
  `0076` built. It makes the repository the unit of transaction membership, so
  every other repository in the same unit of work has to be handed the handle
  separately. The scope makes the unit of work the boundary, which is what a
  transaction is.

## Consequences

- `EntryRepository.transaction` is removed from `entries/repository/types.ts`,
  `built-in.ts` and `table.ts`.
- `entries/internal/bulk.ts` and the `db` parameters on
  `indexEntryRelationships`, `pruneDanglingRelations` and the relationship,
  version and preview-token factories are removed.
- `roadmap/planned/flatten-entry-operations.md` carries the operation-by-operation
  rewrite that this enables.
