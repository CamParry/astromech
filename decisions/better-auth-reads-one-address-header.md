---
area: config
---

# Better Auth reads one trusted address header

Before a request or an `auth.api` call reaches Better Auth, core drops any `x-astromech-client-address` the client sent, sets its own from `getClientAddress`, and names only that header in `advanced.ipAddress.ipAddressHeaders` (`packages/astromech/src/auth/better-auth.ts`). Sign-in limits and `sessions.ip_address` use one trusted address on every runtime.

**Rejected:** Better Auth's default `x-forwarded-for` (a client of an exposed Node server forges it); its `trustedProxies` (duplicates `security.trustProxy`, misses `cf-connecting-ip`); `disableIpTracking` (turns the limiter off with no address).
