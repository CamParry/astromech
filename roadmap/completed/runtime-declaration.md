# Runtime Declaration: Declared, Inherited, or Detected

Does Astromech need to be told which runtime it is on, and if so, where does
that declaration live? Its own config, Astro's adapter, or nowhere at all,
Hono-style. Decide this before adding any `runtime` key.

Follows `roadmap/in-progress/runtime-integrations-and-env.md`, which moved
Cloudflare into `integrations/` and unified environment reads. That work landed
without a runtime declaration, so nothing here is urgent, but two of its pieces
guess where a declaration would state.

## What is already settled

Driver selection does **not** imply a runtime, and cannot be used to infer one.
`d1()` takes either `{ binding }` or `{ database }`, and `r2()` takes either
`{ binding }` or `{ bucket }`, so D1 or R2 over HTTP from Node is a supported
configuration. Workers with `libsql()` and `s3()` is equally valid and names no
Cloudflare driver at all. The inference fails in both directions.

No code infers a runtime from drivers today, and
`DECISIONS.md`
says so: it defers the question rather than settling it.

The word is **runtime**, not "platform".

## The Hono question

Hono works on every runtime with nothing declared. Reading
`hono/helper/adapter` shows it does two things, and only the second is
interesting:

1. `getRuntimeKey()` detects the runtime from `navigator.userAgent`
   (`Deno`, `Bun`, `Cloudflare-Workers`, `Node.js`), then `EdgeRuntime`,
   `fastly`, and `process.release.name`. Astromech already has the Workers half
   of this in `isWorkersRuntime()`.
2. `env(c, runtime)` returns `c.env` on workerd, `process.env` on Node, Bun and
   edge-light, and `Deno.env.toObject()` on Deno. **On Workers the environment
   comes off the request context**, because the Worker handler passes `env` into
   `app.fetch(request, env, ctx)`.

So Hono "just works" because the environment travels per request, not because
detection is clever. Astromech has the same seam available: `request-context/`
is already AsyncLocalStorage. `resolveEnv` could read the environment from the
request scope when inside a request and fall back to the runtime's own global
source outside one, and `setEnvSource` plus its registry slot would go away.

Two things Hono never has to answer, which is where the analogy may break:

- **`scheduled()` runs outside any request.** A Cron Trigger fires with no
  request scope to read from, so a request-scoped environment needs a second
  path for the tick. `createWorkerEntry` already receives `env` as an argument,
  so it can open a scope around the tick — worth checking whether that is clean
  or a special case that undoes the simplicity.
- **Hono has no scheduler.** Choosing between `interval()`, `cloudflareCron()`
  and `webhook()` is a real decision that depends on the runtime and cannot be
  answered by detection alone, because a long-lived Node process and a Node
  process behind a proxy in front of a serverless host want different answers.

## The options

1. **Detect, never declare** (the Hono shape). Environment on the request
   scope, `getRuntimeKey()`-style detection for everything else. Nothing in the
   config. Cheapest for the site author; leaves the scheduler default to
   detection, which is what already misfires.
2. **Declare in the Astromech config.** A `runtime` key. It cannot supply the
   environment (bindings arrive as a function argument), so its jobs would be
   nominating the scheduler default, erroring at boot when the runtime and the
   wiring disagree, and catching a contradiction like `d1({ binding })` on a
   Node target at config time. That last one is the strongest argument, and it
   is the inverse of the inference problem: it lets D1-over-HTTP be stated.
3. **Inherit from the framework.** Two candidate seams, and they are not
   equivalent:
    - `AstroConfig.adapter?.name` in `astro:config:done`, which the Astromech
      integration already implements. Verified readable. Yields a label, at
      config time, by matching another package's name string.
    - `context.locals.runtime.env` in `integrations/astro/middleware.ts`, which
      is how `@astrojs/cloudflare` hands over the real Worker environment, per
      request, in dev and in production. Carries the object rather than a label,
      and is the same shape as Hono's `c.env`.

These compose: 3 supplies the environment, and 1 or 2 answers the scheduler.

## To verify first

- **`context.locals.runtime.env` reaches the Astromech middleware.** A probe of
  this fought the dev server's HMR and was abandoned; nothing here should be
  built on it until it is confirmed.
- **A dev-mode asymmetry that exists today.** `astro dev` against
  `apps/demo-cloudflare` serves correctly, but only because `resolveBinding`
  falls back to wrangler's `getPlatformProxy()`. Nothing calls `setEnvSource` in
  dev, so bindings resolve while wrangler `vars` do not reach `resolveEnv`.
  Option 3's middleware seam fixes this; check whether anything else does.
- **Whether `scheduled()` can open a request scope** without making the
  request-scoped environment a special case.

## If a config key wins

Open question: a string union (`'node' | 'cloudflare' | 'deno' | 'bun'`) or a
factory like the drivers (`runtime: cloudflare()`). A runtime carries no
behaviour to call, so a factory implies options it does not have; the
counter-argument is consistency with every other pluggable thing in the config.
