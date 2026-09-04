# One overload adapter in the entries service

Replace the six hand-written single-or-batch adapters in
`packages/astromech/src/entries/service.ts` with one helper. The operations are
already batch-only and linear (`flatten-entry-operations.md`,
`update-operation-takes-a-batch.md`); this is the last wiring left on the
entries write path that exists only to reshape arguments.

## What is there

`update`, `trash`, `restore`, `delete`, `publish`, `unpublish` and `schedule`
each repeat the same shape: flatten `id` into `ids`, call the batch operation,
return `rows` or `rows[0]` by whether `id` was an array, and unwrap
`BulkOperationError` for a batch of one. Ninety lines, seven copies, and a
`cascadeLocales` spread that two of them carry and the others do not.

## Target shape

```ts
/** Adapt a batch-only operation onto the `id: string | readonly string[]` overload. */
function fromBatch<P extends { id: string | readonly string[] }, R>(
    operation: (params: Omit<P, 'id'> & { ids: readonly string[] }) => Promise<R[]>
) {
    return async (params: P) => {
        const { id, ...rest } = params;
        const many = Array.isArray(id);
        try {
            const rows = await operation({ ...rest, ids: [id].flat() });
            return many ? rows : rows[0];
        } catch (err) {
            throw many ? err : unwrapBatchOfOne(err);
        }
    };
}

export const entriesService: EntriesService = {
    update: fromBatch(updateEntries) as EntriesService['update'],
    trash: fromBatch(trashEntries),
    // …
};
```

The `as EntriesService[…]` casts stay where TypeScript cannot derive the
overload; they are the same casts the file carries now.

## The work

- [x] `service.ts` to the shape above. The service tests in
      `packages/astromech/tests/services/entries/` are the safety net; the single-id
      `ValidationError` assertions are the check that the unwrap still holds.
- [x] `update-operation-takes-a-batch.md` records "written out per verb, no
      shared wrapper"; note in the commit message that the helper replaces
      that, and why (seven identical copies).
