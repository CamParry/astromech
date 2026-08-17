# 0061 — The request store holds the request, and identity resolves on demand

**Date:** 2026-08-17
**Status:** accepted

The request-scoped store held a resolved `{ user, role }`, filled eagerly by the
Astro middleware on every request. That cost two round trips per request — Better
Auth's `getSession`, then the full user row — whether or not anything read the
result. Media serving reads no identity at all, so a page with twenty images paid
forty queries nobody looked at.

`RequestContext` now holds the `Request`. `getCurrentUser()` and
`getCurrentRole()` are async, resolve on the first ask, and cache on the context
object for the rest of that request. Outside a store both return `null` without
touching Better Auth or the database, which is what the CLI, MCP dispatch and
`cron/runner.ts` depend on — they run with no store at all.

`resolveSessionUser` became `getSession`, Better Auth's own name for it.

## The session import is dynamic, and exempt rather than inverted

`request-context/request-context.ts` must stay loadable before
`virtual:astromech/config` resolves, so it reaches the session through a dynamic
`await import('@/users/session')` inside the async getter rather than a static
import. `transport/tools/dispatch.ts` already reached `request-context` this way.

That edge points up the layer table — a capability importing a domain — so
`lint:deps` fails it, and the rule's own comment says an upward edge is a port
waiting to be declared. The port was rejected here. `entry-access.ts` and
`notify-access.ts`, the two precedents, both hold their implementation in a
`globalThis` registry slot injected by `boot/lifecycle.ts`. A slot needs a reason
that names the tsup chunk-duplication problem, and this one has none: the dynamic
import already survives multiple bundle entry points, and a port would add a
wiring step to every graph that resolves an identity — including four route test
files that never run the boot phases. `request-context/request-context.ts` is
therefore named on `NO_UPWARD_EXEMPT` in
`packages/astromech/.dependency-cruiser.cjs`, one file rather than the directory,
with the reason beside the other two exemptions.

## Four resolvers became one

The Astro middleware, Hono's `requireAuth`, Hono's `optionalAuth` and the cron
poke route each called `resolveSessionUser`, and each carried its own "has
someone already done this?" branch reading `getRequestContext()`. Those branches
were **deleted, not relocated**. One place resolves a session now, and it is the
store.

What replaces them is a scope, not a resolver. The Astro middleware calls
`runWithRequest(context.request, next)`, and `createHttpApp` installs the same
call as its first middleware. Two scope establishers rather than one, because
`Astromech.fetch` is a public entry point: an app that could only serve a request
when some outer layer had already established a store would be a trap for every
host that mounts the Hono app directly, and it is what the route tests do. The
nesting is free — the inner scope holds the same request, and a request nobody
asks about resolves nothing either way.

The cron poke keeps its bearer short-circuit. Laziness only helps when nobody
asks, and an external poller carrying a bearer token sends no session cookie, so
asking would resolve a session that was never sent.

## `App.Locals` is gone

`src/env.d.ts` declared `user` and `session` on Astro's global `App.Locals`
through declaration merging, so a host site declaring its own `user` got a
TypeScript conflict and a broken build. Nothing in the repo read either field.
The middleware writes nothing, and the declaration is deleted; the file survives
holding only `/// <reference types="astro/client" />`, which is what types the
`import.meta.env` reads across `src/`.

A host page reaches identity through the application instead, which gains
`getCurrentUser()` and `getCurrentRole()` as thin delegates:

```astro
const app = await getAstromech(); const user = await app.getCurrentUser();
```

If Astro-idiomatic sugar is ever wanted it gets one namespaced key we own
(`Astro.locals.astromech`), which is Clerk's shape. On evidence, not in
anticipation.

## `PluginContext.role` becomes eager

`ctx.role` was a synchronous getter over `getCurrentRole()`, and a getter cannot
await. `PluginContext.role: Role | null` is public plugin API, so the alternative
was making it a promise — which would break every plugin that reads it, for a
type change no plugin author asked for.

Instead `role` is a plain constructor parameter of `createPluginContext`,
exactly as `user` already was, and the public type is unchanged. Every caller was
already async and already passed a user, so each passes a role beside it. No
caller builds a context at boot and reuses it across requests, so nothing
observes a stale role.

The cost is real and worth stating: hook dispatch now asks for the role when it
builds a context, so a request that fires a hook resolves a session even when the
plugin never reads `ctx.role`. The loop body runs only when a handler is
registered, so an install with no hooks on that event pays nothing.

## What `scopeMethods` kept

`scopeMethods` documents that a refusal throws rather than returning a rejected
promise, so the wrapper can cover a synchronous method as honestly as an async
one. The permission check and its `throw` stay synchronous. Only the
`contract.sessionScoped === true` branch became async, returning an async IIFE:
resolving the caller's own subject needs an await, and a session-scoped method is
async anyway. A missing-subject refusal therefore rejects where a permission
refusal throws, and the docblock now says so.

## The role cache is a stopgap

`RequestContext` caches `role` beside `user` although the spec's sketch shows
only `user`. One resolve returns both, and `resolveRole` rebuilds the entire role
map on every call, so recomputing it per ask would be worse than holding it. The
field goes away when the role map is computed once during config resolution
(`specs/application-architecture-map.md`). The fail-open fallback in the same
function is a separate item,
`roadmap/planned/role-resolution-fails-open.md`.
