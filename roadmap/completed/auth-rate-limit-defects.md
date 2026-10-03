# Rate limits count the wrong thing

Found on 2026-10-03 while researching login security
(`roadmap/planned/core-security.md`). Every per-client limit in Astromech
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
and the one database-backed store. The trusted address already existed
(`security.trustProxy`, `packages/astromech/src/transport/http/client-address.ts`);
Better Auth and the forms limit did not use it.

## The work

- [x] A trusted-proxy setting for Node, so `client-address.ts` gives one
      trusted address on every runtime. `security.trustProxy` existed; it is
      now validated, and without it a Node site counts the connection's
      address unless Astro's `security.allowedDomains` makes that forgeable.
- [x] Pass that address to Better Auth (`advanced.ipAddress`, or a private
      header Astromech strips from incoming requests and then sets), so sign-in
      limits and stored session addresses use it.
- [x] Turn Better Auth's limiter on explicitly with `storage: "database"`,
      strict `customRules` for sign-in and password reset, and `/get-session`
      turned off, so D1 is not written on every admin page load.
- [x] Move the forms rate limit onto the same database store. Done as its own
      plugin table (`plugin_forms_rate_limits`), not Better Auth's, which
      prunes rows idle over a minute; keyed by `rateLimitKey` (IPv6 by /64).
- [x] Tests: a forged `x-forwarded-for` on Node without a trusted proxy does
      not change the counted address; the limiter runs with `NODE_ENV` unset;
      two app instances share one count.

## Left open

- `cf-connecting-ip` on workerd is used without the IP check other sources
  get; Cloudflare sets it, so the risk is low.
- An IPv6 zone id (`fe80::1%eth0`) passes the check but Better Auth rejects it,
  so such a client shares the no-address count for sign-in.
- The forms upsert was run by hand on local D1 only; `apps/demo-cloudflare`
  installs no forms plugin, so no check covers it.
