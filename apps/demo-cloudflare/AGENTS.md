# apps/demo-cloudflare

Astromech on Cloudflare Workers: D1 for the database, R2 for media, Cloudflare Image Resizing for transforms and a Cron Trigger for the scheduler. It proves the platform, not the CMS (`apps/demo` is the showcase), so keep it as small as it can be while touching every Cloudflare-specific path. Everything runs on wrangler's local emulation: no Cloudflare account, no network.

## Running it

```
pnpm install
cp ../demo/.env .env          # gitignored, so it does not travel with a checkout
pnpm run build
pnpm run preview              # wrangler dev over the built Worker
```

`pnpm run build` applies the migrations into `.wrangler/state` in this directory. A `wrangler dev` pointed at `dist/server/wrangler.json` needs `--persist-to` for that state, or it boots against an empty database.

## What is Cloudflare-specific here

- `src/worker.ts`: `createWorkerEntry(astro, { config })` exports `fetch` and `scheduled` and registers the Worker's `env`. `main` in `wrangler.jsonc` points at it.
- `wrangler.jsonc`: the D1 and R2 bindings the config names, and a `* * * * *` trigger. Each job's own `schedule`, synced into `_astromech_cron` every tick, decides whether a tick runs it.
- `astromech.config.ts` names no `scheduler`: `createWorkerEntry` supplies `cloudflareCron()`.
- `db:init` passes `--allow-remote`, because the D1 driver reports itself remote even against local emulation.

## The gate

`pnpm run check:boot:cloudflare` from the repo root builds this app, serves it on workerd and asserts `/`, `/cms`, `/cms/api/entries/post`, a `scheduled()` tick and four sign-ins from one address (three refused passwords, then the rate limit). The sign-ins run last: the script says why. It is too slow for the pre-commit hook, so run it by hand after anything touching the Cloudflare path.
