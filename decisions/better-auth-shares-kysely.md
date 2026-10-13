---
area: data
---

# better-auth uses the app's Kysely instance

better-auth queries through the app's Kysely instance with its plugins stripped, since `CamelCasePlugin` renames the keys better-auth reads (`packages/astromech/src/auth/better-auth.ts`).

**Why:** a second instance on a local libSQL file fails with `SQLITE_BUSY` during an app transaction.

**Rejected:** a separate dialect; a busy timeout (blocks the event loop); better-auth's `transaction` option (D1 has none).
