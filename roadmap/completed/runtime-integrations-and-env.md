# Runtime Integrations and the Unified Env Reader

Cloudflare is a runtime, equal in standing to Node and Vercel, so it belongs in
`integrations/` beside the framework glue rather than in a top-level
`src/cloudflare/`. Getting it there exposes two things that have to move with
it: environment access, written four different ways across the package, and the
Worker entry's import of an Astro virtual module.

Branch: `refactor/runtime-integrations-and-env`.

## The env module

- [x] `src/env/index.ts` — `resolveEnv`, `getEnv`, `getEnvRecord` and `setEnvSource`, a registry
      slot so a runtime integration can declare where values come from
- [x] `database/drivers/libsql.ts` — `DATABASE_URL`, `DATABASE_AUTH_TOKEN`
- [x] `storage/drivers/s3.ts` — delete the local `envVar()` helper
- [x] `transport/http/routes/cron.ts` — `ASTROMECH_CRON_SECRET`
- [x] `transport/http/index.ts` — `NODE_ENV`
- [x] `transport/http/middleware/errors.ts` — `NODE_ENV`, and invert the test so
      it fails closed. Today a Worker either throws inside the error handler or
      returns raw exception messages to clients
- [x] `plugins/runtime/plugin-runtime.ts` — delete `resolveEnv()`; `ctx.env`
      becomes a live getter instead of a snapshot taken at register time
- [x] `users/auth.ts` — `BETTER_AUTH_URL`, today read straight from
      `import.meta.env` so it resolves only inside the Vite graph

`admin/` keeps its `import.meta.env.DEV` reads. They are browser code and Vite
replaces them at build time; `getEnv` is server-only.

## Cloudflare as a runtime integration

- [x] `src/cloudflare/bindings.ts` moves under `src/integrations/cloudflare/`
- [x] `createWorkerEntry` takes the config as an argument, so it stops importing
      `virtual:astromech/config` and works under any framework, not just Astro
- [x] The Worker entry calls `setEnvSource` from `cloudflare:workers`, the same
      way it already nominates the scheduler
- [x] The Cloudflare tests move to mirror the new source path

## Scheduler default

- [x] `resolveSchedulerDriver` stops falling back to `interval()`. A config with
      cron jobs and no named scheduler errors at boot naming the three drivers,
      rather than giving a Worker a timer it cannot run

## Demo

- [x] A Cloudflare demo app — Astro on `@astrojs/cloudflare`, with `d1()`,
      `r2()`, `cloudflareImages()` and `cloudflareCron()`, verified against
      wrangler's local emulation so it needs no Cloudflare account
- [x] `check:boot` covers it

The existing demo keeps its name in this pass. Renaming it to name its runtime
touches `check:boot`, `check:config`, `AGENTS.md` and several docs paths, and is
worth doing when a third runtime demo makes the set obvious.

## Docs

- [x] `DECISIONS.md` — the two kinds of integration, why no runtime key was
      added here, and the `NODE_ENV` behaviour change
- [x] `ARCHITECTURE.md` — framework versus runtime integrations, the env module,
      the top-level Cloudflare directory gone
- [x] `TERMINOLOGY.md` — the integration entry covers both kinds
- [x] A Cloudflare deployment guide under the docs app, closing with the Node
      and Vercel stories, since neither needs any Astromech code
