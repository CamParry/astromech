# Foreign key enforcement

Two places say libSQL does not enforce foreign keys:

- `DECISIONS.md`, the "Author clearing enumerates columns from the table
  descriptors" entry, which rejects relying on `ON DELETE set null` for that
  reason.
- The header comment of `packages/astromech/src/users/internal/clear-author-references.ts`.

On 2026-09-15 a probe against `@libsql/client` 0.18.0 found the opposite for a
local file and for `:memory:`: `PRAGMA foreign_keys` reads 1 on a new
connection, an insert with a missing parent fails with `SQLITE_CONSTRAINT:
FOREIGN KEY constraint failed`, and `ON DELETE CASCADE` removes the child row.
D1 enforces foreign keys too, per Cloudflare's docs. The test harness already
relies on enforcement (`packages/astromech/tests/_support/harness.ts`, and
the "or the foreign key fails" comment in `tests/_support/mount-router.ts`).

Remote libsql (sqld and Turso) is unverified.

## The work

- [ ] Check remote libsql: whether a new connection has `foreign_keys` on, and
      whether the client or the driver can turn it on.
- [ ] Then either drop the hand-written clearing in
      `clear-author-references.ts` in favour of `ON DELETE set null`, or keep it
      and restate why (for example a driver that cannot enforce), and correct
      both places above.
