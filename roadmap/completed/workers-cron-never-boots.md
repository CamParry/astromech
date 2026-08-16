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

- [x] **Boot from the scheduled path too.** Done 2026-08-16. `ensureBooted`
      moved to `packages/astromech/src/boot/ensure-booted.ts`, keeping the
      `globalThis`-backed `'boot'` memo, and `handleScheduled` awaits it before
      `onTick`. It loads `virtual:astromech/config` lazily so the module stays
      importable in plain Node (a config selecting `cloudflareCron()` reaches
      it under jiti). `runScheduledJobs` boots too, via dynamic import because
      `boot/boot.ts` imports the runner and a static import would close the
      cycle. `tests/cron/scheduled-boot.test.ts` pins the unbooted path and was
      verified to fail without the fix.
- [x] **Export the entry point.** Done 2026-08-16, from
      `astromech/scheduler/cloudflare` beside `cloudflareCron()`, so a Worker
      wires the driver and the `scheduled()` handler from one import. Not the
      root barrel: a Worker entry importing that would drag the whole core into
      the bundle.
- [x] **Decide what `startScheduler()` does on Workers.** Decided 2026-08-16:
      the config-free default is chosen by runtime — `defaultScheduler()` in
      `boot/boot.ts` returns `cloudflareCron()` on Workers (detected by the
      user agent, via `isWorkersRuntime()`) and `interval()` everywhere else,
      so a Worker never owns a timer and a site need not set `scheduler` at
      all. `apps/docs/configuration/scheduler.md` documents the wiring.

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

Replacing the env var with a registry slot (or passing `apiRoute` into
`getAuth()`) was not part of this work — it is tracked in
[../backlog.md](../backlog.md).
