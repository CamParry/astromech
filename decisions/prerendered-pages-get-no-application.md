---
area: config
---

# A prerendered page gets no application

The middleware returns `next()` for a prerendered page before it creates the application (`packages/astromech/src/integrations/astro/middleware.ts`). A build needs no secret and no database reachable from the build machine, and starts no scheduler. Content pages render on demand.

**Why:** a build that boots the application runs scheduled publishes against the production database.

**Rejected:** booting without the scheduler (every build opens the database, and on Cloudflare reads wrangler's local D1, not the deployed one).
