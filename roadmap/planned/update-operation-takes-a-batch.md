# The update operation takes a batch

Finish what `flatten-entry-operations.md` left in `update`: make it the same
shape as `delete`, `trash` and `restore`, so no file under
`packages/astromech/src/entries/operations/` branches on whether it was given one
id or many. The single-id and multi-id public overloads stay; the one place that
adapts between them is `packages/astromech/src/entries/service.ts`.

## Where the branching is

Every single-versus-many conditional left in the entries domain:

| Where                                                     | What it decides                                              |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/astromech/src/entries/operations/update.ts:56`  | refuse `slug` when the id is an array                        |
| `packages/astromech/src/entries/operations/update.ts:63`  | `isBulk`                                                     |
| `packages/astromech/src/entries/operations/update.ts:99`  | single id rethrows raw, array wraps `BulkOperationError`     |
| `packages/astromech/src/entries/operations/update.ts:121` | return `Entry` or `Entry[]`                                  |
| `packages/astromech/src/entries/operations/status.ts`     | passes `id: string \| readonly string[]` through to `update` |
| `packages/astromech/src/entries/service.ts:54`            | unwrap `restore`'s batch for a single id                     |

`delete.ts`, `trash.ts` and `restore.ts` have none: they take `ids` and return
the batch.

Line 99 exists for one reason. `onError` in
`packages/astromech/src/transport/http/middleware/errors.ts` maps
`ValidationError` to 422 and everything else to 500, and never looks through a
`BulkOperationError`'s `cause`. So a single-id update had to surface the raw
`ValidationError` to get its 422, and a multi-id update with one invalid row
answers 500 today. That second part is a defect, fixed here.

## The shape

Operations are batch-only. `service.ts` is the overload adapter, written out
per verb, no shared wrapper:

```ts
update: ((params) => {
    const ids = [params.id].flat();
    return updateEntries({ type: params.type, ids, data: params.data })
        .then((rows) => (Array.isArray(params.id) ? rows : rows[0]))
        .catch((err) => { throw Array.isArray(params.id) ? err : unwrapBatchOfOne(err); });
}) as EntriesService['update'],
```

`unwrapBatchOfOne` returns `err.cause` when `err` is a `BulkOperationError`,
otherwise `err`. For a batch of one the envelope names nothing the caller does
not already know (`failedId` is the only id, `succeededBefore` is empty), so the
single-id overload hands back the underlying error, which keeps the Local API
contract for a single id (a `ValidationError` stays a `ValidationError`). This
refines the sentence in 0077 that a single id "fails the same way a batch of one
does": the atomicity is the same, the error envelope is dropped.

`onError` learns one case: a `BulkOperationError` whose `cause` is a
`ValidationError` answers 422 with the cause's fields and `failedId` in
`details`. Any other `BulkOperationError` stays 500.

## The work

One branch, `update-operation-takes-a-batch`, one commit per stage, a `coder`
sub-agent per stage, the gate run by the main thread.

**Stage 1 — `update` and the status wrappers**

- [ ] `operations/update.ts`: `updateEntries({ type, ids, data }): Promise<Entry[]>`.
      The slug guard becomes `ids.length > 1 && data.slug !== undefined`, a rule
      about batch size, not a mode. Delete `isBulk`, the rethrow at line 99 and
      the return-shape branch. Always wrap in `BulkOperationError`.
- [ ] `operations/status.ts`: `publishEntries`, `unpublishEntries`,
      `scheduleEntries`, each `({ type, ids, … }): Promise<Entry[]>`, delegating
      to `updateEntries`.
- [ ] `service.ts`: the adapters for `update`, `publish`, `unpublish`, `schedule`,
      `restore`, `trash` and `delete`, one shape each, `unwrapBatchOfOne` beside
      them. The `as EntriesService[…]` casts stay; they are the TypeScript
      overload limitation, not a design choice.
- [ ] Tests: the single-id update tests that assert a `ValidationError` keep
      passing unchanged, which is the check that the unwrap works.

**Stage 2 — the 422 for a multi-id validation failure**

- [ ] `middleware/errors.ts`: the `BulkOperationError` case described above.
- [ ] A route test in `packages/astromech/tests/transport/http/routes/entries-bulk.test.ts`:
      a `bulk-update` with one invalid row answers 422, names the failed id, and
      leaves every row unchanged.
- [ ] `packages/astromech/src/admin/hooks/entries.ts` `bulkErrorMessage` already
      reads `failedId` off the error; confirm the 422 body still reaches it.

**Stage 3 — close out**

- [ ] A decision record for the error-envelope rule (single id unwraps, the
      HTTP layer looks through the envelope), marked as refining 0077.

## Not changing

- The public overloads in `packages/astromech/src/types/services.ts`.
- The REST routes. Their shape is `rest-bulk-route-shape.md`.
- `users/` and `media/`: `flatten-user-and-media-operations.md`.
