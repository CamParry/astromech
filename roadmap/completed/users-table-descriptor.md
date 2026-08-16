# A `defineTable` descriptor for `users`

`users` was the one domain writing its own storage by hand. Built on
`refactor/storage-typing`, alongside `migration-baseline-regeneration.md`, which
is what makes the snapshot change legitimate rather than a hand-edit.

Why it beat the alternatives, and why the "do not do this" comment it reverses
was wrong, is in
`decisions/0056-better-auth-owns-the-users-format-not-its-ddl.md`.

- [x] `usersTable`, describing the format better-auth writes, enrolled in
      `CORE_TABLES` so the baseline-parity test covers it.
- [x] `users/storage.ts` composes on `createStorage`. The hand-typed row and
      patch types, the manual `updatedAt` stamp and three `as unknown as` casts
      are gone; the name/email search keeps the raw-handle shape media uses,
      because a flat `where` cannot express an OR.
- [x] `LEGACY_CODECS` loses its `users` entry, and with it the `appDefaults`
      half that only `users` used.
- [x] **The timestamp format was wrong, and had been since `LEGACY_CODECS` was
      written.** `decode` parsed every better-auth timestamp as
      `new Date(v * 1000)`, but better-auth writes ISO-8601 text, so every
      timestamp it had ever written decoded to an Invalid Date. Found by signing
      up against a real database rather than trusting the assumption. The
      descriptor is ISO, the legacy codec is fixed for `sessions`, `accounts`
      and `verifications` too, and the ISO parser keeps a numeric tolerance for
      rows our own storage had already written in seconds.
- [x] `col.timestamp`'s `storage: 'seconds'` option, added for this work before
      the format was checked, is removed: nothing writes seconds.
- [x] `decodeWith` and `encodePatchWith` are typed from the descriptor, like
      `encodeWith` already was, and `decodeWith` keeps an honest signature for a
      missing row.

## Still open

- `sessions`, `accounts` and `verifications` have no descriptor and keep their
  hand-authored DDL. Nothing of ours writes them, so they earn nothing from one.
  Their columns declare `integer` while better-auth writes text; SQLite affinity
  makes that harmless, and correcting it means editing DDL for tables we do not
  own.
- The `accounts` insert in `transport/cli/commands/users-create.ts` still casts,
  because `accounts` has no descriptor. It is the last one on that path.
