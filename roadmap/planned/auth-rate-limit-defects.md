# Rate limits count the wrong thing

Found on 2026-10-03 while researching login security
(`roadmap/proposed/core-security.md`). Every per-client limit in Astromech
either does not run, counts a client-chosen address, or counts within one
Workers isolate.

- **Better Auth's limiter is off on Workers.** It defaults to
  `rateLimit.enabled ?? isProduction`, and `isProduction` reads `NODE_ENV`,
  which a Worker never sets. `packages/astromech/src/auth/better-auth.ts` passes
  no `rateLimit` option.
- **On Node it counts in memory**, so a restart clears it and two processes
  count apart.
- **Better Auth reads the client address from `x-forwarded-for`** by default,
  not from `packages/astromech/src/transport/http/client-address.ts`. On a
  self-hosted Node server a client sets that header, so an attacker sends a new
  address per attempt, and the forged value is stored in `sessions.ip_address`.
  With no address at all, every client shares one bucket for
  `/sign-in/email` (3 requests per 10 seconds), so one attacker can block every
  sign-in.
- **The forms rate limit counts per isolate.**
  `packages/plugins/forms/src/service/rate-limit.ts` keeps its windows in a
  `globalThis` Map.

The class: any counter or client address that is not the one trusted address
and the one database-backed store. This file absorbs the backlog item on the
forms limit having no trustworthy address on self-hosted Node.

## The work

- [ ] A trusted-proxy setting for Node, so `client-address.ts` gives one
      trusted address on every runtime.
- [ ] Pass that address to Better Auth (`advanced.ipAddress`, or a private
      header Astromech strips from incoming requests and then sets), so sign-in
      limits and stored session addresses use it.
- [ ] Turn Better Auth's limiter on explicitly with `storage: "database"`,
      strict `customRules` for sign-in and password reset, and `/get-session`
      turned off, so D1 is not written on every admin page load.
- [ ] Move the forms rate limit onto the same database store.
- [ ] Tests: a forged `x-forwarded-for` on Node without a trusted proxy does
      not change the counted address; the limiter runs with `NODE_ENV` unset;
      two app instances share one count.
