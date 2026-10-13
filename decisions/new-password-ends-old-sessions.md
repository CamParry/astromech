---
area: config
---

# A new password ends the old sessions

A password reset deletes every session of the user, and a password change revokes the other sessions whatever the client sent (`packages/astromech/src/auth/better-auth.ts`). `PUT /api/users/:id` refuses an `email` from a caller without `users:update` (`packages/astromech/src/transport/http/routes/users.ts`), until changing an email asks for the password.

**Why:** a stolen session could otherwise change the email, then reset the password.

**Rejected:** trusting the client's `revokeOtherSessions` (a stolen session leaves it unset); a `databaseHooks.account.update` deleting every session (signs the caller out too); rewriting the body in `handleAuthRequest` (`auth.api` calls skip it).
