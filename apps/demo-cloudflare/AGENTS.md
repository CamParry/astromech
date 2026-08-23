# apps/demo-cloudflare

Astromech on Cloudflare Workers: D1 for the database, R2 for media, Cloudflare
Image Resizing for transforms, and a Cron Trigger for the scheduler. Its job is
to prove the platform, not to show off the CMS — `apps/demo` is the content
showcase, and this one stays as small as it can while still touching every
Cloudflare-specific path.

Everything runs against wrangler's local emulation, so it needs no Cloudflare
account and no network.

## Running it

```
pnpm install
cp ../demo/.env .env          # gitignored, so it does not travel with a checkout
pnpm run build
pnpm run preview              # wrangler dev over the built Worker
```

`pnpm run build` applies the migrations through `getPlatformProxy()`, which
writes to `.wrangler/state` in this directory. `wrangler dev` defaults its own
state to wherever its config file sits, so a run pointed at
`dist/server/wrangler.json` must be given `--persist-to` or it boots against an
empty database. `scripts/check-boot-cloudflare.mjs` does exactly that.

## What is Cloudflare-specific here

- `src/worker.ts` — `createWorkerEntry(astro, { config })`, which exports
  `fetch` and `scheduled` and registers the Worker's `env`. `main` in
  `wrangler.jsonc` points at it, and the Astro build emits it as
  `dist/server/entry.mjs`.
- `wrangler.jsonc` — the D1 and R2 bindings the config names, and a
  `* * * * *` trigger. The cadence is deliberately dumb: the real schedule is
  the runner's due-evaluation, read from `_astromech_cron`.
- `astromech.config.ts` names no `scheduler`. `createWorkerEntry` nominates
  `cloudflareCron()`, and boot fails loudly inside a Worker if nothing did.

`db:generate` and `db:init` pass `--allow-remote` because the D1 driver reports
itself remote whether it is reaching the real database or wrangler's local
emulation, and cannot tell the two apart.

## The gate

`pnpm run check:boot:cloudflare` from the repo root builds this app, serves it
on workerd and asserts `/` 200, `/cms` 200, `/cms/api/entries/post` 401 and a
`scheduled()` tick. Like `check:boot` it is too slow for the pre-commit hook, so
run it by hand after anything touching the Cloudflare path.
