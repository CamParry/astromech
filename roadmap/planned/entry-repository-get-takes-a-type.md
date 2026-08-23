# `EntryRepository.get` takes a type

`get(id)` cannot tell a caller whether the row it found belongs to the type the
caller asked for, so every by-id operation re-checks that itself through a
helper. Moving the type into the signature would delete the helper and its
fourteen call sites. It also changes an interface third-party plugins implement,
which is why this is a record rather than a cleanup.

## What is actually true today

`packages/astromech/src/entries/repository/types.ts` declares:

```ts
get(id: string, opts?: { includeTrashed?: boolean }): Promise<R | null>;
```

The built-in repository lists one `entries` table holding every type, so a
get-by-id can return a row of a different type than the caller addressed. The
guard against that lives in `packages/astromech/src/entries/internal/records.ts`
as `getEntryOfType`, which fetches through `repository.get`, throws
`EntryTypeMismatchError` on a mismatch, and is called by fourteen operations.
Five of those fourteen discard the row entirely and call it only for the throw.

The contract already contemplates the other arrangement. The doc block on `get`
says "the caller asserts the row's `type` matches the type it asked for, though
a repository may throw the canonical mismatch error itself instead". Nothing
takes that option, because `get` is given no type to compare against.

The check is security-relevant: without it, an operation addressed at one type
can read and mutate a row of another. That is the reason it must not be
copy-pasted into fourteen files, and the reason moving it deserves care.

## The question

Should the type be part of addressing a row, or a check the service applies
after the row comes back?

Arguments for moving it into `get`:

- It is a data-access concern. The repository knows whether its rows carry a
  `type` column at all — `tableRepository`-backed types do not, which is why the
  current guard is written as `record.type !== undefined && record.type !== type`.
  A repository can answer that without the caller knowing which kind it is.
- It removes a helper whose name has been hard to settle precisely because it
  describes a workaround rather than a thing.
- A repository that can scope the read by type can also push the predicate into
  the query, rather than fetching a row it will then reject.

Arguments against:

- `EntryRepository` is exported and implemented outside this repo. Adding a
  required parameter is a breaking change for every plugin repository.
- The five call sites that use it purely as a precondition still need somewhere
  to express "this entry exists and is of this type", and `get` returning `null`
  does not express it.

## The work

- [ ] **Decide the signature.** `get(id, { type, includeTrashed })` with `type`
      optional keeps existing implementations compiling and lets the built-in
      opt in first. A required `type` is cleaner and breaks every implementor.
      This choice governs everything below.
- [ ] **Decide what a mismatch does.** Throwing `EntryTypeMismatchError` from
      the repository matches what the contract's doc block already anticipates.
      Returning `null` is simpler and loses the distinction between "no such
      row" and "wrong type", which the REST layer currently maps to different
      responses.
- [ ] **Implement in the built-in repository and `tableRepository`**, then in
      the plugin repositories under `packages/plugins/`.
- [ ] **Delete `getEntryOfType` / `getEntriesOfType`** and update the fourteen
      call sites in `packages/astromech/src/entries/operations/`.
- [ ] **Give the five precondition sites a home.** They are `staging/get.ts`,
      `staging/delete.ts`, `relationships.ts`, `versions/list.ts` and
      `preview/token.ts`. If `get` throws on mismatch, a bare `await` on it
      reads as a guard and needs nothing further.
- [ ] **Write the decision record** covering the signature, the mismatch
      behaviour, and the break for third-party repositories.

## Related, and worth settling in the same pass

Four places throw a bare `Error` for a missing row, with no typed error and two
duplicated message strings:

- `packages/astromech/src/entries/internal/records.ts` — `Entry '${id}' not found`
- `packages/astromech/src/entries/repository/built-in.ts` — the same string
- `packages/astromech/src/entries/operations/versions/restore.ts` — `Version not found`, twice

`packages/astromech/src/entries/errors.ts` holds ten typed error classes and no
not-found among them, so the one condition every by-id read can hit is the one
condition callers cannot catch by type. If the by-id read path is being reworked
anyway, this is the moment to add the class.

## Not in scope

**Changing `list` or `query`.** Both already take `type` as a parameter. Only
the by-id read is missing it.
