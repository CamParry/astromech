# 0089 — Cloudflare is a runtime integration, and the environment has one reader

**Date:** 2026-08-23
**Status:** accepted

`src/cloudflare/` is gone. Binding lookup and the Worker entry both live in
`src/integrations/cloudflare/`, and every environment read in the package goes
through `src/env/`. `createWorkerEntry` takes the site config as an argument,
so it no longer reaches into an Astro virtual module and works under any
framework.

## Two kinds of integration

`integrations/` holds two things that answer different questions, and the flat
list did not say which was which:

- A **framework integration** answers how a request reaches Astromech, where the
  config lives, and how the routes and the admin SPA get mounted. `astro/` is
  the one that exists; SvelteKit, Next and TanStack Start are planned.
- A **platform integration** answers where environment values come from and
  whether the host has an entry point that is not an HTTP request.

They are orthogonal. Astro on Cloudflare, TanStack Start on Cloudflare and
Astro on Vercel are all valid pairs, and no directory layout that treats the two
as one list can say so. The two kinds stay siblings in one flat `integrations/`
rather than nesting under `frameworks/` and `platforms/`: there are five
framework integrations coming and one platform integration, and a directory
level that separates a group of five from a group of one earns nothing.

**A platform earns a directory only when it has a non-standard environment
mechanism or a non-HTTP entry point.** Cloudflare has both: bindings, and
`scheduled()`. Node has neither. Vercel has neither, because `process.env`
works and Vercel Cron is an HTTP request, which is what `webhook()` already
serves. So Node and Vercel are documentation, not code, and this record does not
create a `RuntimeIntegration` interface for a set with one member.

## No runtime key in the config

Every platform-varying choice a site makes is already a named driver:
`d1()` or `libsql()`, `r2()` or `filesystem()` or `s3()`, `cloudflareImages()`
or `sharp()`, `cloudflareCron()` or `interval()` or `webhook()`. A `runtime:`
key would be a fifth declaration of the same fact, and the only new thing it
could do is disagree with the other four. 0059 rejected a `platform` key for
the scheduler alone; the reasoning generalises, and this records it as the rule.

A site that already uses `@astrojs/cloudflare` therefore declares nothing extra.
It adds one entry file if it wants Cron Triggers, and nothing at all otherwise.

## One environment reader

Reading the environment was written four times: a `globalThis.process?.env`
guard in `storage/drivers/s3.ts`, a `process.env` and `import.meta.env` merge in
`plugins/runtime/plugin-runtime.ts`, a `typeof process !== 'undefined'` ternary
in `transport/http/routes/cron.ts`, and a bare `process.env` in
`database/drivers/libsql.ts`. `users/auth.ts` read `import.meta.env` directly,
so `BETTER_AUTH_URL` resolved only inside the Vite graph.

`src/env/` replaces all of them, and follows 0088's verbs rather than inventing
its own:

- `resolveEnv(name)` returns the value or `undefined`, for the reads that have a
  fallback at the call site.
- `getEnv(name)` returns the value and throws naming the variable, for the ones
  that do not.
- `getEnvRecord()` returns every string value, for the plugin `ctx`. It is built
  per call, because the previous snapshot was taken at plugin-register time and
  could predate the platform supplying its source.
- `setEnvSource(source)` is how a platform integration declares where values
  come from, the same registry shape `setDefaultScheduler` already uses.

It sits in its own module rather than in `utilities/` because it holds a
registry slot, and everything in `utilities/` is a pure function over its
arguments.

`isWorkersRuntime()` moves here too. Which host this is and where values come
from are one subject, and putting the check in `env/` lets `cron/registry.ts`
read it without importing an integration.

Hono's `env(c)` was the obvious name to copy, and it is the wrong shape here.
`env(c)` is safe because the context is passed in, making it per-request by
construction. Astromech has no context to pass, so a record-returning `env()`
would invite `const { A, B } = env()` and reintroduce exactly the snapshot the
plugin runtime already got wrong.

## The Worker hands over its own environment

A Worker calls `fetch(request, env, ctx)` and `scheduled(event, env, ctx)`. The
environment is an argument, so `createWorkerEntry` registers it synchronously
inside each handler. That removes the runtime detection that used to sit in
front of a dynamic `cloudflare:workers` import, and it makes bindings and string
vars one object: `resolveBinding('DB')` and `resolveEnv('SITE_URL')` now read
the same source.

A registered environment is authoritative for bindings. A miss against it is a
deploy misconfiguration, not a reason to start wrangler and look somewhere else.
Wrangler's `getPlatformProxy()` remains for CLI commands running against D1 in
plain Node, and it is not published through `setEnvSource`: a `wrangler.jsonc`
var silently outranking a `.env` value would be a surprise for one narrow case.

`setBindingEnv` is deleted. It was a second setter for what is now one source.

## What this changes in behaviour

**`createWorkerEntry(server, { config })` takes the config.** It previously did
`await import('virtual:astromech/config')`, which is the Astro integration's
virtual module. A platform integration reaching into a framework integration is
backwards, and it meant the Worker entry could not be used under any other
framework. Passing the config in is what the framework integrations already ask
for.

**An unset `NODE_ENV` now means production.** `transport/http/index.ts` and
`transport/http/middleware/errors.ts` both tested `NODE_ENV !== 'production'`.
Inside a Worker `process` does not exist, so that line either threw inside the
error handler or decided the deployment was development and returned raw
exception messages to clients. The test is now `=== 'development'`, so it fails
closed. Astro's dev server sets `NODE_ENV`, so local work is unaffected; a Node
deployment that never set it stops receiving detailed error messages, which is
the correct direction.

**The scheduler still defaults to `interval()`, except in a Worker.** Requiring
every site to name a scheduler was rejected: `interval()` is genuinely right for
any long-lived host, and the mandate would tax every Node site to fix one
Cloudflare case. `resolveSchedulerDriver` instead throws when it would fall
through to the ticker inside a Worker isolate, naming `createWorkerEntry` and
the two drivers that work there.

## Rejected

- **A `runtime` or `platform` key in `AstromechConfig`.** Covered above: a fifth
  declaration of what four driver choices already say, and one that can
  contradict them.
- **Nesting `integrations/frameworks/` and `integrations/platforms/`.** A
  directory level separating five from one.
- **A symmetric `RuntimeIntegration` interface with a directory per platform.**
  `roadmap/planned/multi-runtime-and-framework-integrations.md` assumed one, and
  the survey found Node, Vercel, Deno and Bun all need no code at all. An
  interface with one implementation describes that implementation.
- **`env()` returning the whole record, matching Hono.** Covered above.
- **Keeping `bindings.ts` at the top level to avoid a driver importing from
  `integrations/`.** `bindings.ts` imports only leaves, which
  `ARCHITECTURE.md` already permits from any layer, and a Cloudflare driver
  depending on Cloudflare's platform module is honest rather than inverted.
- **Publishing wrangler's environment through `setEnvSource`.** It would let a
  `wrangler.jsonc` var shadow a `.env` value for any Node process that happened
  to resolve one binding.
