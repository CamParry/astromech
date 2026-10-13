---
area: config
---

# A failed sign-in counts against the email

Failures are counted against the normalized email, known or not, hashed with SHA-256 because people type passwords into the email field (`packages/astromech/src/security/sign-in-failures.ts`). A locked sign-in answers 429 `ACCOUNT_LOCKED` with `Retry-After`. Only `/sign-in/email` is counted, so a password reset works while locked and clears the count.

**Why:** Better Auth answers an unknown email and a wrong password alike, and a lock keyed on the user id would reveal which emails exist.

**Rejected:** keying on the user id; a refusal that reads like a wrong password (tells a real user nothing).
