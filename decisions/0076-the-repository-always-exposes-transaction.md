# 0076 — The repository always exposes `transaction`

**Date:** 2026-08-20
**Status:** accepted
**Supersedes:** 0028 (the call-site-visibility point only)

Every `EntryRepository` now has a required `transaction` method. On a driver with
no interactive transactions (D1, `supportsTransactions: false`) it runs the
callback once, sequentially, with an undefined `db` handle. Callers write
`repository.transaction(fn)` with no branch.

## Context

`0028` settled that a D1 site boots and degrades to sequential writes rather than
refusing to start. It expressed that degrade by leaving `transaction` off the
repository on a no-transaction driver, so the three operations that wanted
atomicity (entry create, the bulk runner, staged merge) each branched:

```
repository.transaction ? repository.transaction(fn) : fn(repository, undefined)
```

`0028` kept that branch on purpose, to hold the non-atomic path visible at every
call site, and it rejected "a no-op `transaction()` that runs the callback and
resolves ... while reading at every call site as though it were safe."

Two things changed the trade. The branch was copied across create, bulk, and
merge, and `0077` unifies single and bulk writes onto one dispatcher, which would
have spread the same branch to update, delete, trash, and restore. And "a single
mutation is a batch of one" (`0077`) needs `transaction` present unconditionally,
because the single path must open one too.

## Decision

`transaction` is a required method on every repository. When
`supportsTransactions()` is true it runs `fn` atomically with a tx-bound
repository and the raw tx handle. When false it runs `fn` once with `db`
undefined, the same sequential writes `0028` committed to. The degrade moved from
the call sites into the method.

This is not the no-op `0028` rejected. That objection was against faking
atomicity, and nothing here fakes it:

- `supportsTransactions` stays the honest gate; the flag still decides.
- The method's own doc states that it runs sequentially with no atomicity on such
  a driver.
- `apps/docs/configuration/database.md` still states the durability difference.

The behaviour on D1 is exactly what it was. Only the branch location changed: the
honesty `0028` placed in a per-call-site conditional now lives in the type and
the docs.

## Rejected

- **Keep `transaction` optional, branch at each call site.** What `0028` chose,
  and right while only three sites branched. It loses once the branch is about to
  be copied to seven, and once the single path must open a transaction too.
  Per-call-site visibility was carrying less than the duplication cost.
- **A no-op `transaction()` that pretends atomicity.** Still rejected, for
  `0028`'s reason. The difference is that the degrade here is documented and gated
  on the honest flag, not hidden behind a method that reads as safe while faking.

## Consequences

- Entry create, the bulk runner, and staged merge call `repository.transaction(fn)`
  directly. Single-id update, delete, trash, and restore follow under `0077`.
- `0055` (a tx-bound storage's `transaction()` throws) is unchanged: nesting still
  fails loudly. The always-present method degrades on a no-transaction driver; it
  does not nest on a tx-bound one.
