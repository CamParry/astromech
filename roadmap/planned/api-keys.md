---
milestone: 1.0
---

# API keys

Only a session cookie identifies a caller, so a build script, a CI job or a site
on another host has no way in, and `astromech/fetch` sends cookies only. Raised
on 2026-10-03; decided the same day.

## What exists

Identity is resolved once per request in `packages/astromech/src/auth/session.ts`
(session, then the user row, then the role). A key is checked there, before the
cookie. CORS already allows `Authorization`.

## Prior art

- **WordPress application passwords:** owned by a user, acting as them, hashed,
  shown once, last used recorded at most daily; deleted with the user.
- **Strapi admin tokens:** owned by a user and capped at the owner's
  permissions; refused but kept when the owner is deactivated. Expiry of 7, 30
  or 90 days, or unlimited.
- **GitHub fine-grained tokens:** narrower than the owner, enforced; inactive
  once the owner loses access.
- **Better Auth's `@better-auth/api-key`:** never checks a ban, is left behind
  when its owner is deleted, does not cap a key at its owner's role, writes the
  key row on every request, and defaults to 10 requests a day.

## Decided (2026-10-03)

- **Astromech's own table**, not Better Auth's plugin, for the gaps above. A
  key is random, stored as a SHA-256 hash, shown once, and listed by name and a
  short prefix. It is deleted with its owner. The last-used time is written at
  most once an hour.
- **A key belongs to a user and never exceeds that user's current role.** For
  1.0 a key is full (the owner's role) or read-only. Choosing individual
  permissions comes later, on the same rule: the key's permissions and the
  owner's role, both.
- **A suspended owner's keys are refused** (`roadmap/planned/user-suspension.md`).
- **Sent as `Authorization: Bearer`.** `astromech/fetch` gains an `apiKey`
  option.
- **Default expiry 90 days**, with 7, 30, 90 days or never to choose from.
- **Each user manages their own keys** after confirming their password
  (`roadmap/planned/two-factor-and-passkeys.md`); an admin can revoke anyone's.
- A key cannot confirm a password, so it cannot reach the sensitive actions.

## The work

- [ ] The table, with `pnpm run db:generate` and the Cloudflare baseline
      hand-applied.
- [ ] Create, list and revoke service methods.
- [ ] The check in `auth/session.ts`: hash lookup, expiry, owner suspended,
      read-only enforced, last used.
- [ ] The `apiKey` option in `astromech/fetch`, and the docs.
- [ ] The admin: the keys panel on the user screen.

## Testing

A key reads as its owner; a read-only key is refused a write; a key is refused
once expired, once revoked, once its owner is suspended, and after a role change
that removes the permission; deleting the owner removes the key; a key cannot
confirm a password.
