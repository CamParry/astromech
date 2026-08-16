# Workers cron never boots the runtime

A Cloudflare Cron Trigger fires `scheduled()`, not `fetch()`, so it never touches
`src/middleware.ts`. `ensureBooted()` lives there and nowhere else, so on a
scheduled tick nothing has run `initRuntime` and the first thing the runner asks
for is missing: `runDue` calls `getDb()` on its first line
(`packages/astromech/src/cron/runner.ts`) and gets
`[Astromech] 'db' is not configured.` `getRuntimeConfig()` on the next line would
throw the same way.

This is not a regression. Boot ran in `astro:config:setup` before, and a Worker
never ran that either, so the entry point has never worked on Workers. What
changed is the shape of the problem: with boot on the first request there is now
exactly one place the runtime is booted from, and `scheduled()` is structurally
outside it rather than accidentally missing it.

- [ ] **Boot from the scheduled path too.** `handleScheduled` in
      `packages/astromech/src/cron/index.ts` calls `onTick` directly. It needs
      the same memoised boot the middleware runs, which means `ensureBooted`
      moves out of `src/middleware.ts` into something both entry points import.
      The memo is already `globalThis`-backed via `createRegistry`, so sharing it
      is a move, not a redesign.
- [ ] **Export the entry point.** `handleScheduled` is not exported from the root
      barrel or any subpath, so the usage its own docblock documents
      (`export default { async scheduled(event, env, ctx) { … } }`) cannot be
      written by a site today. `runScheduledJobs` is exported and is the same
      `onTick` call with `new Date()`, so it has the identical boot gap.
- [ ] **Decide what `startScheduler()` does on Workers.** The middleware's boot
      starts the node scheduler's timer. A Worker has platform cron and wants no
      timer, and a site that sets `scheduler` gets its driver started on the
      first request whether or not that makes sense there.

## Adjacent: `process.env` written inside the request path

`initRuntime` ends with `process.env.ASTROMECH_API_ROUTE = resolvedConfig.apiRoute`
(`packages/astromech/src/boot/boot.ts`). Its only reader is
`packages/astromech/src/users/auth.ts`, which does
`const apiRoute = process.env.ASTROMECH_API_ROUTE ?? '/api'` at module scope.

The module-scope read has been fixed — it moved inside `getAuth()`, which only
runs during a request, after `ensureBooted()`. Measured before and after with
`apiRoute: '/cms-api'` in the demo: sign-in went 404 to 200, and presetting
`ASTROMECH_API_ROUTE` in the environment made the broken version work, which
confirmed the read was the whole cause.

What remains is the channel. `process.env` is the wrong way to pass a value
between two parts of core: on Workers it is a compatibility shim populated from
bindings, not a plain mutable object a module may assign to, so the write at the
end of `initRuntime` is not guaranteed to do anything there.

- [ ] **Replace the env var with a registry slot,** or pass `apiRoute` into
      `getAuth()` from the caller. Either removes the `process.env` write, which
      is the part that does not survive Workers. The read is no longer the
      problem.
