# Suspending a user

A user's access cannot be cut without deleting them. A role with no
permissions does not do it: the user still signs in, can change their own email
through `PUT /api/users/:id`, and can use Better Auth's account endpoints. Raised
on 2026-10-03, reversing the suspension part of `DECISIONS.md`, "Users are
deleted or suspended, not archived". **Target: 1.0.**

## Prior art

- **Directus:** `status: suspended`; deletes the user's sessions; static tokens
  refused while not active. Its automatic suspension after failed sign-ins needs
  an admin to undo.
- **Ghost:** a suspended staff user keeps their posts; every request checks the
  user is active.
- **Strapi:** `blocked` on users and `isActive` on admin users, checked on every
  request; a deactivated owner's admin tokens are refused but kept.
- **Better Auth's admin plugin:** `banUser` with a reason and an expiry,
  sessions deleted. It brings its own role field and access control, and its
  API-key sessions never check the ban.
- **Clerk:** `banUser`, and `lockUser` with an expiry.

Every one keeps a suspended user's content.

## Decided (2026-10-03)

- **Suspension, in Astromech's own columns** on the user: whether suspended, an
  optional end date and a reason. Rejected: Better Auth's admin plugin, which
  brings a second role system; and an archived status, which stays rejected.
- **What it does:** deletes the user's sessions, refuses sign-in (through
  Better Auth's `databaseHooks.session.create.before`), and refuses their API
  keys. Content and author stamps are untouched.
- **Checked on every request**, on the user row `auth/session.ts` already reads,
  so it applies at once.
- **An expired suspension lifts on its own.**
- Suspending needs `users:update` and a confirmed password
  (`roadmap/planned/two-factor-and-passkeys.md`), and is recorded in the
  activity log.

## The work

- [ ] The columns, with `pnpm run db:generate` and the Cloudflare baseline
      hand-applied.
- [ ] `users.suspend` and `users.unsuspend` service methods, revoking sessions.
- [ ] The checks: session creation, every request, and API keys.
- [ ] The admin: a Suspend action on the user screen with a reason and an
      optional end date, a suspended badge in the user list, and a message on
      the sign-in form.
- [ ] Document suspension in `apps/docs/content/users.md`.

## Testing

A suspended user's existing session is refused on its next request; sign-in is
refused; their API key is refused; their entries are untouched; a suspension
with a past end date no longer blocks.
