# Suspending a user

Reopened on 2026-10-03. `DECISIONS.md` ("Users are deleted, not archived")
rejected suspension (Ghost) in favour of a role with no permissions. Security
research then found suspension or banning is the common way to cut off access
at once, so the decision is open to revision. Research it when this is picked
up.

## Prior art to check

- **Directus:** a `suspended` user status, set automatically after too many
  failed sign-ins and cleared by an admin.
- **Better Auth's admin plugin:** `banUser` with a reason and an expiry, and
  `unbanUser`. It brings its own `role` field and access control, which overlap
  with Astromech's `role` column and permissions.
- **Ghost:** suspended staff users keep their posts and cannot sign in.
- **Strapi:** a `blocked` flag on users and `isActive` on admin users.
- **WordPress:** none in core; plugins add it.

## Questions

- Does a ban with an expiry give anything a no-permission role plus "sign out
  everywhere" (`roadmap/proposed/core-security.md`) does not? A role change
  loses the user's previous role, which a ban keeps.
- Does the failed-sign-in lockout suspend the account (Directus) or only block
  the address?
- If adopted, revise the `DECISIONS.md` entry rather than adding a second one.
