# Two-factor sign-in and passkeys

Sign-in is an email and a password only. Raised on 2026-10-03. **Target: 1.0.**

## Prior art

- Added late almost everywhere: Kirby 4 (TOTP, 2023), Craft 5 (TOTP and
  passkeys, 2024), Ghost (email codes, 2025), Statamic 6 (TOTP and passkeys,
  January 2026). Payload's request is still open. WordPress relies on plugins.
- **Craft's elevated sessions** ask for the password again before sensitive
  actions (`elevatedSessionDuration`, 300 seconds).
- **Better Auth:** the `twoFactor` plugin (TOTP, one-time codes, backup codes,
  trusted devices, and a lockout after 10 failed codes) and the
  `@better-auth/passkey` package; `session.freshAge` for re-authentication.

## Proposal

- TOTP with backup codes, set up by each user from their profile.
- Passkeys as a second way to sign in.
- Re-authentication before sensitive actions: changing an email address, a
  password, two-factor settings or an API key (`roadmap/proposed/api-keys.md`).

## Open questions

- Can a role require two-factor sign-in? If so, what happens to a user in that
  role who has not set it up (forced setup at next sign-in, as Craft does)?
- Does an admin reset another user's two-factor settings, and how is that
  recorded?
