# Entry author columns are never written

The columns are written, go null when the user they name is deleted, and are
shown in the admin.

The defect this file opened on: the `entries` table declared `createdBy` and
`updatedBy`, the repository contract accepted both, the built-in repository
forwarded both into the insert, and no service path ever supplied either, so
every entry in every install held null on both.

## What is actually true today

`packages/astromech/src/entries/tables.ts` declares both as
`col.reference('users')`. `packages/astromech/src/entries/repository/types.ts`
admits `createdBy` and `updatedBy` on `EntryRow` and on `EntryWrite`, and
`packages/astromech/src/entries/repository/entries-table.ts` forwards
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

- [x] **`createdBy` and `updatedBy` are set on every write**, from
      `getCurrentUser()`, null outside a request context. All three create paths
      stamp both: `create`, `duplicate` (the copy belongs to whoever duplicated
      it, not to the source's author) and `createStaged`. `updateEntries`
      threads the acting id into `updateOne`.
- [x] **Both are optional on `Entry`**, for the `tableRepository` reason.
- [x] **`updatedBy` moves on a status-only change**, because `status.ts` is a
      wrapper over `updateEntries` and the stamp travels with `updatedAt`. The
      two answers deliberately differ: `changesVersionedContent` decides whether
      a _snapshot_ is taken, which is a question about content, and this is a
      question about the row.
- [x] **A deleted user's author references go null.** The columns are now
      `ON DELETE set null` FKs, and because libSQL opens with foreign keys off,
      `deleteUser` nulls them itself so behaviour matches across drivers
      (`DECISIONS.md`, "Author columns are `ON DELETE set null`"). `set null` is a
      new option on the `OnDelete` type, and the migration rebuild guard now
      refuses a rebuild of a table a `set null` FK points at, the same way it
      already refuses one under `cascade`. Every other author column (globals,
      media, users, settings) is `set null` too, and `deleteUser` finds them by
      walking the table descriptors rather than a hand list.
- [x] **Surface it in the admin.** An "Updated by" system column on the entry
      list and one metadata line under the edit page header (updated and created,
      each with a date and a name). The id-to-name lookup the version history
      page had is now the shared `useAuthorNames` hook in `admin/hooks/`, gated
      on `users:read`; an id it cannot resolve renders nothing, never a raw id.

## Related

**Versions already carry this.** `entry_versions.createdBy` records who took the
snapshot, alongside `createdAt`, which is when the row was made. That pairing is
the model to follow: `createdBy` answers who made this row, not who authored the
content it holds.

**Not the audit trail.** `roadmap/planned/audit-trail.md` records which method
ran, for whom, with what outcome. This is a stamp on the row itself, answering
"who last touched this entry" without a log lookup. The two can coexist; if the
trail lands first, these columns are still the cheaper read.
