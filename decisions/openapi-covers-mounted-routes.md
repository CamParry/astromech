---
area: structure
---

# OpenAPI covers every route but internal ones

Beside the route tables, the document covers the multipart media uploads, the entry-type reads, `POST /rpc/{id}` once, and Better Auth's routes, generated with `auth.api.generateOpenAPISchema()` and prefixed `Auth` (`packages/astromech/src/transport/http/routes/auth-document.ts`). First-run setup, the cron poke and the document itself stay out, as Strapi leaves out its admin API. `packages/astromech/tests/transport/http/routes/openapi-document.test.ts` fails on a mounted route the document lacks.

**Rejected:** listing the auth routes by hand (drifts on each upgrade); serving Better Auth's own schema route (a second document); calling its `generator` directly (declared, not exported).
