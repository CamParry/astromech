---
area: structure
---

# Routes come from one table

One table of verb, path and method id feeds the Hono handler, the OpenAPI document and the fetch client (`packages/astromech/src/transport/http/routes/http-routes.ts`), and `POST /rpc/:id` reaches any manifest method. A plugin method answers its raw result under the same access rules on `/rpc/plugins.*` and on `/plugins/:name/:method`, so a public one needs no session on either.

**Rejected:** build-time client codegen; retiring REST for RPC; retiring the hand-written CLI commands; a `{ data }` envelope for plugin methods on RPC alone.
