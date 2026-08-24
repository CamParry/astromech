# Entry author columns are never written

The `entries` table declares `createdBy` and `updatedBy`, the repository contract
accepts both on a write, the built-in repository forwards both into the insert,
and no service path ever supplies either. Every entry in every install has
`createdBy: null` and `updatedBy: null`, and the `Entry` domain type has both
fields commented out — so the columns exist, are writable by a third-party
repository, and are invisible through the service.

## What is actually true today

`packages/astromech/src/entries/tables.ts` declares both as
`col.reference('users')`. `packages/astromech/src/entries/repository/types.ts`
admits `createdBy` and `updatedBy` on `EntryRow` and on `EntryWrite`, and
`packages/astromech/src/entries/repository/built-in.ts` forwards
`data.createdBy ?? null` and `data.updatedBy ?? null` into the insert.

`packages/astromech/src/types/domain.ts` carries both on `Entry` as commented-out
lines. That is the honest state: the shape was designed for them and the wiring
was left undone, rather than a type promising a value it cannot hold.

Nothing calls it. Across `packages/astromech/src/entries/operations/` the only
`createdBy` is on the version snapshot, which is a different table.

The acting identity is already available on both write paths: `getCurrentUser()`
from `@/request-context/index` is awaited inside `toStoredFields` on every create
and update, and `packages/astromech/src/entries/operations/preview/token.ts`
writes `user?.id ?? null` into a `col.reference('users')` column of its own.

## The work

- [ ] **Set `createdBy` on create and `updatedBy` on update**, from
      `getCurrentUser()`, falling back to `null` outside a request context (a CLI
      job, a seed script, the scheduler).
- [ ] **Uncomment both fields on `Entry`** and decide whether they are optional.
      A `tableRepository`-backed type has no such columns, which is the same
      reason `type` and `locales` are conditional on the row shape.
- [ ] **Decide whether `updatedBy` moves on a status-only change.** Publishing is
      a write, and `changesVersionedContent` already draws a line between a
      content change and a status change for versions. The two answers should
      agree, or the difference should be stated.
- [ ] **Decide what happens when the referenced user is deleted.** The column is
      an FK with no `onDelete`, so deleting a user either fails or orphans the
      reference depending on the driver. `DECISIONS.md`
      sets the house rule for the relationship index — dangling ids are tolerated
      and pruned on write — but that covers field data, not a column FK.
- [ ] **Surface it in the admin.** An entry list column and a detail line are the
      obvious places. Both need an id-to-name lookup; the version history page
      has one, and it should not grow a second copy.

## Related

**Versions already carry this.** `entry_versions.createdBy` records who took the
snapshot, alongside `createdAt`, which is when the row was made. That pairing is
the model to follow: `createdBy` answers who made this row, not who authored the
content it holds.

**Not the audit trail.** `roadmap/planned/audit-trail.md` records which method
ran, for whom, with what outcome. This is a stamp on the row itself, answering
"who last touched this entry" without a log lookup. The two can coexist; if the
trail lands first, these columns are still the cheaper read.
