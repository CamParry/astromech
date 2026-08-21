# Flatten the entry operations

Rewrite each file in `packages/astromech/src/entries/operations/` so that the
path from an operation to its SQL is three hops, readable top to bottom in one
function, with no higher-order wrappers and no transaction handle passed by
hand. `decisions/0080-transactions-are-scoped-not-threaded.md` holds the
transaction decision this depends on. The same shape is then applied to
`users/` and `media/`, which are not covered here.

## The problem, measured on `delete`

A single `entriesService.delete({ type, id })` today:

| Hop | Where                                                                    | What it does                                                   |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 1   | `entries/service.ts`                                                     | `delete: deleteEntry`                                          |
| 2   | `operations/delete.ts` `deleteEntry`                                     | builds two nested closures                                     |
| 3   | `internal/hooks.ts` `runDeleteWithHooks`                                 | loads a snapshot per id (`repository.get`), fires before-hooks |
| 4   | `internal/bulk.ts` `runOnIdsVoid`                                        | discards the return                                            |
| 5   | `internal/bulk.ts` `runOnIds`                                            | branches single vs array                                       |
| 6   | `internal/bulk.ts` `runBulk`                                             | wraps errors                                                   |
| 7   | `repository/registry.ts` → `getBuiltIn` → `createBuiltInEntryRepository` | resolves the repository                                        |
| 8   | `repository/built-in.ts` `transaction`                                   | builds a second repository bound to the tx handle              |
| 9   | `operations/delete.ts` `deleteOne`                                       | back in the op file                                            |
| 10  | `internal/records.ts` `loadAndAssertType`                                | `repository.get` again for the same row                        |
| 11  | `repository/built-in.ts` `del`                                           | with cascade, `findOne` a third time                           |
| 12  | `database/repository/create-repository.ts` `delete`                      | Kysely                                                         |

Twelve hops across seven files; the row is fetched three times. `update`,
`trash` and `restore` have the same shape.

Five concerns are inherent: per-type repository lookup (table-backed types),
plugin hooks, atomic batches, relationship-index cleanup, locale cascade.
Everything else is wiring.

## What is wrong, and what replaces it

1. **Continuation-passing wrappers.**
   `runDeleteWithHooks(..., () => runOnIdsVoid(..., (repo, db, id) => deleteOne(...)))`
   is three nested closures for a straight-line sequence. Write it linearly:
   load, before-hooks, `transaction` around a loop, after-hooks. `internal/bulk.ts`
   and `internal/hooks.ts` are deleted; the ~15 lines they shared are written
   in each operation.

2. **The `string | string[]` overload drives `bulk.ts`.** `runOnIds`,
   `runOnIdsVoid` and `runBulk` exist to return `Entry` or `Entry[]` by input
   shape, and they force the per-id body out into a callback. The
   implementation takes `ids: string[]` always; a single id is a batch of one
   (`decisions/0077-a-single-mutation-is-a-batch-of-one.md`). The public Local
   API keeps `id: string | string[]` as a one-line wrapper over that, so the
   `restore as EntriesService['restore']` cast in `service.ts` goes.

3. **Hook placement is correct; the engine and the helper are not.** All
   `before*` hooks fire before any DB work; `after*` hooks fire after commit.
   Keep that. What goes is the swallow-and-log in `dispatchAfter` (a throw
   propagates from either, `decisions/0081-one-hook-runner-a-throw-propagates.md`)
   and the separate snapshot load: fetch each row once at the top of the
   operation and use that record for the hook context, the type assertion and
   the cascade.

4. **Locale cascade is split across two layers.** The op deletes sibling
   relationship rows; the repository deletes sibling entry rows; each assumes
   the other. Cascade is domain policy, so the op resolves the siblings
   (`repository.translatable.siblings`) and deletes each target the ordinary
   way. `cascadeLocales` is removed from `repository.delete` and
   `repository.trash.trash`; the repository never touches the relationships
   index.

5. **The transaction handle is threaded by hand.** Replaced by the scoped
   `transaction(fn)` in `decisions/0080-transactions-are-scoped-not-threaded.md`.
   This is the one architectural change and it goes first.

6. **Double capability gating.** `assertCapability(type, 'trash')` followed by
   `if (!repository.trash) throw`. The type's capabilities are the one source of
   truth. One gate, the first.

## Target shape (delete)

```ts
export async function deleteEntries(params: {
    type: string;
    ids: readonly string[];
    cascadeLocales?: boolean;
}): Promise<void> {
    const { type, ids } = params;
    const repository = getEntryRepository(type);
    const entries = await loadEntries(repository, type, ids);        // one fetch, type-asserted
    const targets = params.cascadeLocales
        ? await withLocaleSiblings(repository, entries)
        : entries;
    const user = await getCurrentUser();
    const relationships = createRelationshipRepository();

    for (const entry of entries) {
        await runHook('entry:beforeDelete', { type, entry, user, permanent: true });
    }

    await transaction(async () => {
        const succeeded: string[] = [];
        for (const target of targets) {
            try {
                await relationships.deleteByResource(target.id, 'entry');
                await repository.delete(target.id);                     // versions cascade via FK
                succeeded.push(target.id);
            } catch (err) {
                throw new BulkOperationError({ failedId: target.id, succeededBefore: succeeded, cause: err, ... });
            }
        }
    });

    for (const entry of entries) {
        await runHook('entry:afterDelete', { type, entry, user, permanent: true });   // a throw propagates; the write stays
    }
}
```

Depth from op to SQL: `deleteEntries` → `repository.delete` →
`createRepository.delete` → Kysely. A reader sees every decision on one screen.

## Rules for every rewritten operation

- One exported function per file, written top to bottom. No helper that takes a
  callback. A private helper is fine when it names a real step
  (`withLocaleSiblings`, `loadEntries`), not when it exists to share a loop.
- Each row is fetched once. The record feeds the hook context, the type check
  and any cascade.
- `transaction(async () => { ... })` wraps the writes only. Hooks, validation,
  snapshots and lookups run outside it.
- No `db` parameter anywhere. If a function needs one, the fix is in
  `decisions/0080`, not in the call site.
- `BulkOperationError` is thrown from an inline try/catch around the loop body,
  carrying `failedId` and `succeededBefore`, exactly as now.
- One capability gate, `assertCapability`, at the top.
- Comment contract per `decisions/0078-the-comment-contract.md`.
- Behaviour is unchanged unless this file says otherwise. The service tests in
  `packages/astromech/tests/services/entries/` are the safety net; run them
  before and after every operation.

## The work

Each stage is one commit on one branch, `flatten-entry-operations`, in a
worktree at `../Astromech-worktrees/flatten-entry-operations`. Implementation
goes to a `coder` sub-agent with the target shape and the rules above; the main
thread reviews the diff and runs the gate itself.

**Stage 0 — scoped transactions** (`decisions/0080`)

- [x] Add `database/transaction.ts`: an `AsyncLocalStorage<Db>` in the
      `globalThis` registry (the pattern `request-context` uses), `transaction(fn)`
      that joins an open scope, degrades on `supportsTransactions() === false`,
      and otherwise runs `getDb().transaction().execute((trx) => store.run(trx, fn))`.
- [x] `getDb()` in `database/registry.ts` returns the stored handle first.
- [x] `createRelationshipRepository`, `createVersionRepository`,
      `createPreviewTokenRepository` and the two helpers in
      `database/repository/resource-existence.ts` take `db?: Db` and resolve
      `db ?? getDb()` per call, not in a default parameter.
- [x] Remove `transaction` from `EntryRepository` (`repository/types.ts`,
      `built-in.ts`, `table.ts`). Point existing callers (`create`, `staging/merge`,
      `internal/bulk.ts`) at the new function; `bulk.ts` is deleted in stage 3,
      so a minimal edit is enough here.
- [x] Remove the `db` parameter from `indexEntryRelationships` and
      `pruneDanglingRelations` and every call site.
- [x] Gate, plus `pnpm run check:boot`. A test that opens `transaction()` and
      asserts a nested call joins rather than throws, replacing the 0055 test.

**Stage 1 — one hook runner** (`decisions/0081`)

- [x] Add `hooks/` as a leaf: `addHook(event, handler)`, `runHook(event, payload)`
      returning the payload after each handler's non-`undefined` return replaces
      it, and `hasHook(event)`. One loop, no try/catch. The registry goes in the
      `globalThis` namespace like every other registry.
- [x] `plugins/runtime/plugin-runtime.ts`: `registerPlugins` calls `addHook`
      per `def.hooks` entry; `ctx.emit` becomes `ctx.runHook`. Delete the registry,
      `dispatchBefore`, `dispatchAfter`, `runBeforeHooks`, `runAfterHooks`,
      `hasHookHandlers` and `emitEvent`.
- [x] `types/hooks.ts`: drop the seven events nothing fires (`media:*`,
      `auth:*`, `api:*`) and the header paragraph on name-keyed failure
      semantics. Handler type gains a `void | Payload` return.
- [x] `entries/operations/create.ts` and `entries/internal/hooks.ts` call `runHook`
      instead; `hooks.ts` itself is deleted in stage 3.
- [x] A test that an `after*` handler throw propagates and the row is still
      there, and that a `before*` throw leaves no row.

**Stage 2 — delete**

- [x] Rewrite `operations/delete.ts` to the target shape. Remove
      `cascadeLocales` from `repository.delete` in `built-in.ts`, `table.ts`
      and `types.ts`; the op resolves siblings via `repository.translatable`.
- [x] `service.ts`: `delete` accepts `id: string | readonly string[]` and calls
      `deleteEntries({ ids: [id].flat() })`. Route and CLI callers unchanged.

**Stage 3 — trash and restore**

- [x] `operations/trash.ts` `trash` to the target shape; `cascadeLocales` leaves
      `repository.trash.trash` the same way. `emptyTrash` gains a `transaction()`
      around its relationship cleanup and purge, which it lacks today.
- [x] `operations/restore.ts` to the target shape, returning the rows.
- [x] Delete `internal/bulk.ts` and `internal/hooks.ts` once nothing imports them.
      (Done in Stage 4, after `update.ts` dropped its `runOnIds` /
      `runUpdateWithHooks` imports.)

**Stage 4 — update**

- [x] `operations/update.ts`: inline the loop, drop `runUpdateWithHooks` and the
      `FieldContext.db` field. The body (`updateOne`, `toStoredFields`,
      `getUniquenessExcludeIds`) is already straight-line and stays; only the
      dispatch changes. The status wrappers in `status.ts` are untouched.

**Stage 5 — the single-row writes that skipped transactions**

- [x] `duplicate`, `staging/create`, `versions/restore`: wrap the row write and
      `indexEntryRelationships` in `transaction()`. This is the atomicity defect
      0080 names; it is a behaviour change and the commit message says so.
- [x] `staging/merge`: drop the `(txRepository, txDb)` callback shape for a
      zero-arg body. Already linear otherwise. (Done in Stage 0.)
- [x] `create`: same, the transaction body becomes zero-arg. (Done in Stage 0.)

**Stage 6 — close out**

- [ ] `ARCHITECTURE.md`: the entries section names `transaction()` as a
      `database/` function and no longer describes `EntryRepository.transaction`.
      `TERMINOLOGY.md` if any entry describes the handle.
- [ ] `apps/docs/configuration/database.md` still states the D1 durability
      difference; confirm, do not restate.
- [ ] Open a roadmap file for `users/` and `media/` with the same rules, so the
      repository `delete` in each (which already calls
      `createRelationshipRepository(db ?? getDb())`) is brought onto the scope.

## Not changing

- Hook placement: all `before*` before the scope opens, all `after*` after it closes. A throw propagates from either (`decisions/0081`).
- Batch atomicity, `BulkOperationError` shape, and the public Local API overloads
  (`decisions/0077`).
- The repository layer below `EntryRepository`: `createRepository`, the
  per-type registry and the table adapter are the right three hops and stay.
- D1 behaviour: still sequential, still documented.
