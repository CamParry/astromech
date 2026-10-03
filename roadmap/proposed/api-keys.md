# API keys

Only a session can call the API, so a build script, a CI job or a site on
another host has no way in. Raised on 2026-10-03. **Target: 1.0.**

## Prior art

- **WordPress application passwords (5.6):** the REST API had no way for
  outside apps to log in from 2015 to 2020. A key belongs to a user and acts
  as them.
- **Payload, Strapi, Directus, Sanity, Contentful** all ship API keys in core.
  Strapi's tokens can be read-only, full access or custom; Directus gives a
  user a static token.
- **Better Auth's `apiKey` plugin:** hashed keys, expiry, per-key rate limits,
  and a key resolves to a user session.

## Proposal

- A key belongs to a user and carries that user's role, as an application
  password does, so the permission system needs nothing new.
- Created, listed and revoked on the user's screen; shown once; stored hashed;
  an optional expiry; last-used time recorded.
- Accepted as `Authorization: Bearer` on the REST and JSON-RPC routes and by
  `astromech/fetch`.
- Creating a key needs a fresh session (`roadmap/proposed/two-factor-and-passkeys.md`).

## Open questions

- Can a key be narrowed below its user's role (Strapi's read-only token), or
  is a separate user with a narrow role the way to do that?
- Better Auth's plugin or Astromech's own table?
