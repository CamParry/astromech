# 0082 — Operations take a batch; the service adapts the single-id overload and drops its error envelope

**Date:** 2026-08-21
**Status:** accepted; refines 0077

Every mutating entry operation under `packages/astromech/src/entries/operations/`
takes `ids: readonly string[]` and returns the batch. The public overloads
(`id: string` returns a row, `id: readonly string[]` returns rows) are adapted
in one place, `packages/astromech/src/entries/service.ts`, which also unwraps the
`BulkOperationError` envelope for a single id. The HTTP error handler looks
through the envelope when its cause is a `ValidationError`.

## Context

0077 made a single id a batch of one and said it "fails the same way a batch of
one does". `flatten-entry-operations` brought `delete`, `trash` and `restore`
onto an `ids`-only signature, but left `update` accepting `string | string[]`
with an `isBulk` flag that decided three things inside the operation: whether
to refuse `slug`, whether to return `Entry` or `Entry[]`, and whether to rethrow
the raw error or wrap it. The third existed because `onError` in
`transport/http/middleware/errors.ts` mapped `ValidationError` to 422 and never
looked inside a `BulkOperationError`, so a single-id update had to surface the
raw error to get its 422, and a multi-id update with one invalid row answered 500.

## Decision

- **Operations are batch-only.** `updateEntries`, `publishEntries`,
  `unpublishEntries`, `scheduleEntries`, `deleteEntries`, `trashEntries` and
  `restoreEntries` take `ids` and return the batch. A rule that depends on batch
  size (`slug` on more than one id) is written as `ids.length > 1`, not as a
  mode. No operation file branches on how it was called.
- **The service is the overload adapter.** Each public verb flattens the id in,
  takes `rows[0]` out for a single id, and is written out per verb. There is no
  shared higher-order adapter; seven visible copies were preferred to one
  callback wrapper, the same call the flatten made for the per-item loop.
- **A single id drops the envelope.** For a batch of one, `BulkOperationError`
  names nothing the caller does not know (`failedId` is the only id,
  `succeededBefore` is empty), so the single-id overload rethrows `cause`. On
  the Local API a `ValidationError` from `entries.update({ id: 'x', … })` is a
  `ValidationError`, as it was before 0077.
- **The HTTP layer looks through the envelope.** A `BulkOperationError` whose
  cause is a `ValidationError` answers 422 with the cause's field map and
  `failedId` and `succeededBefore` in `details`. Any other cause stays 500.

This refines 0077's sentence: a single id and a batch of one have the same
atomicity and the same rollback; they differ only in whether the caller receives
the batch envelope, which for one id carries no information.

## Rejected

- **Separate `update` / `updateMany` services.** 0077's reason stands: the
  semantics are the same (atomic, rows returned), and the three status wrappers
  would double with them. The branching this would remove was not caused by the
  unified service; it was the unfinished migration plus a leaked HTTP concern.
- **Keep the raw rethrow inside the operation.** It made the operation know how
  it was called, which is the thing being removed, and it left the multi-id 500
  in place.
- **Wrap a single id in the envelope on the Local API too.** Literal to 0077's
  wording, but every plugin and script catching `ValidationError` on a single
  write would have broken for a wrapper that tells them nothing.
