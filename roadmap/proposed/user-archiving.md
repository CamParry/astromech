# User archiving

Deleting a user today clears every `createdBy` and `updatedBy` that names them
(`onDelete: 'set null'`) and removes their content rows and notifications
(`packages/astromech/src/users/methods/delete.ts`). A person who leaves takes
the record of what they wrote with them. Archiving keeps the account row, so
the stamps still resolve, and stops it being used. Raised on 2026-10-03 while
deciding that stamps are not authorship (`DECISIONS.md`, "`createdBy` and
`updatedBy` are stamps, not authorship").

## Prior art

- **Directus** gives a user a `status`: `active`, `invited`, `draft`,
  `suspended` or `archived`. Only `active` signs in.
- **Ghost** suspends a staff user rather than deleting them; their posts keep
  their author.
- **WordPress** deletes, but first asks whether to delete the user's content or
  attribute it to another user.
- **Payload** hard-deletes. **Strapi** hard-deletes an admin user and its
  `createdBy` and `updatedBy` become null.

## Open questions

- **Does real deletion stay?** A right-to-erasure request needs it. Likely:
  archive is the usual way to remove someone, and delete remains as a separate
  destructive action that clears the stamps as today, or anonymises the row.
- **What archived means:** no sign-in, sessions revoked, hidden from user lists
  and pickers by default, not counted by the last-admin check, no
  notifications.
- **The word.** `archived` (Directus) or `suspended` (Ghost). Directus has both
  for different things: suspended is temporary, archived is gone.
- **Restoring** an archived user, and whether their role survives.
