---
area: config
---

# Better Auth's rate limiter counts in the database

The limiter is always enabled and stores its counts in the `rate_limits` table (`packages/astromech/src/auth/better-auth.ts`). Sign-in and password reset get stricter rules, with windows of at most 60 seconds, since Better Auth prunes rows idle longer than its longest default window. `/get-session` is not counted, so it writes nothing to D1.

**Why:** Better Auth's default turns it on by `NODE_ENV`, which a Worker never sets, and memory counts per isolate and empties on restart.

**Rejected:** `secondary-storage` (needs a key-value store a site does not otherwise have).
