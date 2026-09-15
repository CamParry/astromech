# Foreign key enforcement

Two places said libSQL does not enforce foreign keys:

- `DECISIONS.md`, whose entry on clearing a deleted user's author columns
  rejected relying on `ON DELETE set null` for that reason.
- The header comment of `clear-author-references.ts` in core's users module,
  which nulled those columns by hand before the delete.

On 2026-09-15 a probe against `@libsql/client` 0.18.0 found the opposite for a
local file and for `:memory:`: `PRAGMA foreign_keys` reads 1 on a new
connection, an insert with a missing parent fails with `SQLITE_CONSTRAINT:
FOREIGN KEY constraint failed`, and `ON DELETE CASCADE` removes the child row.
D1 enforces foreign keys too, per Cloudflare's docs. The test harness already
relied on enforcement.

## The work

- [x] Check remote libsql: whether a new connection has `foreign_keys` on, and
      whether the client or the driver can turn it on. sqld and the native
      binding both build SQLite with `SQLITE_DEFAULT_FOREIGN_KEYS=1`, and sqld
      sets no pragma of its own on a connection. The client cannot change it
      for a remote database: each `execute()` opens a Hrana stream, which is
      one connection, and closes it. Turso's docs say its preview "Turso
      Database" engine has enforcement off.
- [x] Then either drop the hand-written clearing in
      `clear-author-references.ts` in favour of `ON DELETE set null`, or keep it
      and restate why (for example a driver that cannot enforce), and correct
      both places above. Dropped: the user delete already relied on the
      database for four cascades. The migration runner now refuses a database
      with enforcement off, so a server like Turso's preview engine fails at
      `db:init` rather than leaving dangling ids.

Found along the way: the assistant plugin's `approvals` and `sessions` tables
hold a `userId` with no foreign key, so they outlive a deleted user. That is
`roadmap/completed/assistant-rows-outlive-their-user.md`.
