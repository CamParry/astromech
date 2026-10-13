# apps/demo-cloudflare

Astromech on Cloudflare Workers: D1 for the database, R2 for media, Cloudflare Image Resizing for transforms and a Cron Trigger for the scheduler. It proves the platform, not the CMS (`apps/demo` is the showcase), so keep it as small as it can be while touching every Cloudflare-specific path. Everything but the testing deployment runs on wrangler's local emulation: no Cloudflare account, no network.

## Running it

```
pnpm install
cp ../demo/.env .env          # gitignored, so it does not travel with a checkout
pnpm run build                # also applies the migrations into .wrangler/state here
pnpm run preview              # wrangler dev over the built Worker
```

A `wrangler dev` pointed at `dist/server/wrangler.json` needs `--persist-to` for that state, or it boots against an empty database. Every build copies `.env`, secrets included, into `dist/server/.dev.vars` ([The Cloudflare demo's build copies its whole `.env`](../../decisions/cloudflare-demo-build-copies-env.md)).

## What is Cloudflare-specific here

- `src/worker.ts`: `createWorkerEntry(astro, { config })` exports `fetch` and `scheduled`, registers the Worker's `env` and supplies `cloudflareCron()`, so the config names no `scheduler`.
- `wrangler.jsonc`: the D1 and R2 bindings, Workers Caching, and a `* * * * *` trigger. Each job's own `schedule` decides whether a tick runs it.
- `astromech.config.ts` imports the migration chain from `migrations/index.ts`, so the Worker checks the database against it with no file system.
- `astro.config.mjs` stores every page for a minute through `cacheCloudflare()`, so Astromech's `cache.set(false)` is what keeps its own routes out. `src/pages/api/invalidate.ts` purges cache tags: a Worker's cache is purged only from inside the Worker.
- `src/pages/[slug].astro` renders a page entry, and with `?preview=<token>` makes a read no cache may store.

Run `pnpm run check:boot:cloudflare` from the repo root by hand after anything touching the Cloudflare path. Its header says what it asserts.

## Testing deployment

A permanent deployment for the checks only a real Worker can run: production D1, Cron Triggers, `cf.image` and the Cache API. It is the `testing` environment in `wrangler.jsonc`: Worker `astromech-demo-cloudflare-testing`, D1 database `astromech-testing` and R2 bucket `astromech-testing-media` on the Paragram account, served at https://astromech-testing.paragramagency.com (a custom domain; there is no `workers.dev` URL).

- **Redeploy with `pnpm run deploy:testing`** in this directory, after `wrangler login`. It builds the packages this app imports, migrates the remote database, builds for `testing` and deploys.
- **Never run `wrangler deploy` by itself.** It deploys whatever config the last build wrote to `dist/server/wrangler.json` and ignores `--env`, so after a plain build it deploys the local configuration as a Worker named `astromech-demo-cloudflare`. `wrangler tail --env testing` and `wrangler secret put --env testing` read `wrangler.jsonc`, so they are safe.
- The secrets `BETTER_AUTH_SECRET`, `ASTROMECH_CRON_SECRET` and `ASTROMECH_CAPTCHA_SECRET` are set with `wrangler secret put --env testing` and survive deploys. The site URL, the cron secret, the admin's sign-in and the Turnstile keys are in the gitignored `testing-credentials.env` here; it is not named `.env.testing`, which a testing build would copy into `.dev.vars`. If you lack it, ask whoever holds it, or set a new cron secret and create an admin with `users:create` under `CLOUDFLARE_ENV=testing` and `--allow-remote`.
- **If the database is ever emptied, run first-run setup again at once**: until a user exists, anyone who reaches `/cms` can create the admin.
- Image transforms work only while this hostname is on the zone's `transformations_allowed_origins`; off it, every variant request is served the original.
- **The site has a captcha only during a captcha run.** Run `deploy:testing` with `CAPTCHA_PROVIDER` and `CAPTCHA_SITE_KEY` unset: a build with them and a Worker without renders a widget nothing checks. `deploy:testing:captcha` passes both to the build and the Worker.
- `pnpm run check:deployed:cloudflare` from the repo root (a worktree works too) runs the checks that need this deployment, and `--captcha turnstile` makes a captcha round. It writes to the site, so it never runs in `verify` or CI. Its header lists the checks, the ones run by hand, and how.
