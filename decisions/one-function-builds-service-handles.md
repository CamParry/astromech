---
area: structure
---

# One function builds every service handle

`createServices(ctx, { overrideAccess })` (`packages/astromech/src/app-context/services.ts`) binds every service and plugin namespace to one context, trusted by default, as tRPC's `createCaller(ctx)` and Payload's Local API do. Every untrusted call, plugin methods included, goes through the scoped handle (`overrideAccess: false`), which checks each method's `access` against `ctx.role`. A method acting on the caller declares `sessionScoped`, and the scoped handle refuses it with nobody signed in.

**Rejected:** separate trusted and scoped builders (each cast on its own); plugin RPC checking `access` itself (the tool loop cannot scope plugin methods); injecting `userId` into a session method's input.
