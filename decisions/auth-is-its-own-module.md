---
area: structure
---

# Authentication is its own module

`packages/astromech/src/auth/` holds the Better Auth wiring, sessions, first-run setup and Better Auth's tables. It imports `users`, never the reverse.

**Why:** a session, an account and a verification are not users.

**Rejected:** auth inside `users/` (Strapi's layout).
