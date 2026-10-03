# Two-factor sign-in, passkeys and confirming your password

Sign-in is an email and a password only, and nothing asks for the password
again before a sensitive action. Raised on 2026-10-03; decided the same day.
**Target: 1.0.**

## What exists

- Better Auth 1.6 ships the `twoFactor` plugin in its core package (TOTP,
  one-time codes, backup codes, trusted devices, and a 15-minute lock after 10
  failed codes). Passkeys are the separate `@better-auth/passkey` package, not
  installed. A passkey sign-in creates its session directly, so the
  `twoFactor` check never runs for it.
- Better Auth's `session.freshAge` measures time since sign-in. There is no way
  to confirm a password again without signing in again, and `/change-email`
  and `/two-factor/disable` do not check it.
- Better Auth's tables are core tables (`packages/astromech/src/auth/tables.ts`),
  and a parity test fails when a Better Auth plugin's tables are missing.

## Prior art

- Added late almost everywhere: Kirby 4, Craft 5, Ghost (email codes), Statamic 6. Payload's request is still open.
- **Requiring it:** Craft by user group and Statamic by role, both forcing setup
  at the next sign-in; Statamic enforces it in middleware on every request.
- **Passkeys:** Craft, Statamic and GitHub treat a passkey sign-in as both
  factors.
- **Resetting another user's two-factor:** Statamic, as an action behind an
  elevated session; Craft from the CLI only.
- **Confirming the password:** Craft's elevated session (5 minutes, renewed by
  password or passkey) for granting permissions, impersonation, managing
  two-factor and tokens; GitHub's sudo mode (2 hours).

## Decided (2026-10-03)

- **TOTP with backup codes** through Better Auth's `twoFactor` plugin, its
  tables added to core's schema.
- **Passkeys sign in on their own** and count as both factors, through
  `@better-auth/passkey`. Both ship in 1.0.
- **A role can require two-factor sign-in.** Checked on the server on every
  request: a user in that role without it set up reaches only the setup screen.
  A passkey sign-in satisfies the requirement.
- **An admin can reset another user's two-factor**, after confirming their own
  password; recorded in the activity log.
- **Confirming your password is Astromech's own.** Confirming with a password,
  TOTP code or passkey marks the session confirmed for 10 minutes. Required for
  changing your own email or password, managing two-factor, passkeys or API
  keys, granting roles, suspending or deleting a user, and resetting someone's
  two-factor. Rejected: Better Auth's `freshAge`, which counts from sign-in and
  is not checked by the endpoints that matter.

## The work

- [ ] Better Auth's `twoFactor` tables and columns as core tables, with
      `pnpm run db:generate` and the Cloudflare baseline hand-applied; the
      plugin configured in `packages/astromech/src/auth/better-auth.ts`.
- [ ] `@better-auth/passkey`, its table, and the sign-in and registration flow.
- [ ] The admin: set up and remove TOTP, show and regenerate backup codes,
      register and remove passkeys, the second-step sign-in screen.
- [ ] The per-role requirement and its every-request check.
- [ ] The confirmation window: a column on the session, the confirm endpoint,
      a check the sensitive methods share, and a confirm dialog in the admin.
- [ ] The admin reset of another user's two-factor.

## Testing

A user with TOTP cannot get a session from the password alone; a backup code
works once; a passkey sign-in passes a role's requirement; a required user
without two-factor reaches only setup; a sensitive action is refused without a
confirmation and allowed within 10 minutes of one.
