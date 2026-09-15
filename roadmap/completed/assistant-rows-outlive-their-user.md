# Assistant rows outlive their user

The assistant plugin stores the user a row belongs to as
`col.text({ notNull: true })`, with no foreign key:

- `packages/plugins/assistant/src/tables/approvals.ts`, `userId`
- `packages/plugins/assistant/src/tables/sessions.ts`, `userId`
- Both created in `packages/plugins/assistant/migrations/0000_baseline.ts`
  without a `REFERENCES` clause.

Deleting a user leaves its assistant sessions and pending approvals behind.
Core's own tables handle this with `ON DELETE cascade` on every reference to
`users`. The only clearing the plugin does is a user resetting their own
sessions (`src/service/sessions.ts`).

Found on 2026-09-15 while removing core's hand-written author clearing.

## The work

- [x] Check whether a plugin table can declare a reference to core's `users`
      table, and whether plugin migrations can add a foreign key to an existing
      table (SQLite needs a table rebuild).
- [x] Declare `userId` as a reference to `users` with `onDelete: 'cascade'`,
      with a plugin migration, or subscribe to the user delete if a reference
      is not possible.
- [x] A test that deleting a user removes its assistant sessions and
      approvals.

A reference was possible, so no event subscription was needed. Both tables now
declare `col.reference('users', { notNull: true, onDelete: 'cascade' })`, and
`plugin:generate` wrote `migrations/0001_reference-users.ts`, which rebuilds
both tables. It was hand-edited to first delete rows whose user is already
gone.
