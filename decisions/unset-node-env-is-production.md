---
area: config
---

# Unset `NODE_ENV` means production

Any `NODE_ENV` but `development` or `test`, unset included, reads as production (`packages/astromech/src/env.ts`). In production the middleware refuses every request while `BETTER_AUTH_SECRET` is unset (`packages/astromech/src/auth/better-auth.ts`).

**Why:** a Worker sets no `NODE_ENV`, and Better Auth signs with a public default secret whenever `NODE_ENV` is not `production`.

**Rejected:** Hono's `env()`; refusing in `build()` (every CLI command runs it).
