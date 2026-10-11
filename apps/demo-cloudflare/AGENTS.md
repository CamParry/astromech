# apps/demo-cloudflare

Astromech on Cloudflare Workers: D1 for the database, R2 for media, Cloudflare Image Resizing for transforms and a Cron Trigger for the scheduler. It proves the platform, not the CMS (`apps/demo` is the showcase), so keep it as small as it can be while touching every Cloudflare-specific path. Everything but the testing deployment below runs on wrangler's local emulation: no Cloudflare account, no network.

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
- Workers Caching (`cache` in `wrangler.jsonc`) with Astro's `cacheCloudflare()` provider and a route rule storing every page for a minute (`astro.config.mjs`), so Astromech's `cache.set(false)` on its own routes is what keeps them out. `src/pages/api/invalidate.ts` purges cache tags for a signed-in user: a Worker's cache is purged only from inside the Worker.
- `src/pages/[slug].astro` renders a page entry, and with `?preview=<token>` makes the preview read no cache may store.

## The gate

`pnpm run check:boot:cloudflare` from the repo root builds this app, serves it on workerd and asserts `/`, `/cms`, `/cms/api/entries/post`, a `scheduled()` tick and four sign-ins from one address (three refused passwords, then the rate limit). The sign-ins run last: the script says why. It is too slow for the pre-commit hook, so run it by hand after anything touching the Cloudflare path.

## Testing deployment

A permanent deployment on the Paragram Cloudflare account, for the checks only a real Worker can run: production D1, Cron Triggers, `cf.image` and the Cache API (which needs a custom domain). It is the `testing` environment in `wrangler.jsonc`.

- URL: https://astromech-testing.paragramagency.com (a Workers custom domain on the `paragramagency.com` zone; `workers_dev` is off, so there is no `workers.dev` URL)
- The zone limits Image Transformations to listed source origins, and `cloudflareImages()` transforms only when this hostname is on that list (the zone's `transformations_allowed_origins` setting). Off it, every variant request is served the original.
- Worker `astromech-demo-cloudflare-testing`, D1 database `astromech-testing`, R2 bucket `astromech-testing-media`

Redeploy with `pnpm run deploy:testing` in this directory, after `wrangler login` to the account. It migrates the remote database (`CLOUDFLARE_ENV=testing`, `db:init --allow-remote`, as `apps/docs/deployment/cloudflare.md` describes), builds for the `testing` environment and runs `wrangler deploy --env testing`. The build applies no migrations under `CLOUDFLARE_ENV=testing`, because the binding there is remote. Never run `wrangler deploy` by itself: it deploys whatever config the last build wrote to `dist/server/wrangler.json` and ignores `--env`, so after a plain `pnpm run build` or `check:boot:cloudflare` it would deploy the local configuration as a Worker named `astromech-demo-cloudflare`.

`wrangler tail --env testing` and `wrangler secret put --env testing` read `wrangler.jsonc` itself, so they reach this Worker whatever the last build was.

The Worker's secrets, `BETTER_AUTH_SECRET` and `ASTROMECH_CRON_SECRET`, are set with `wrangler secret put --env testing` and survive deploys. `BETTER_AUTH_URL` is a plain `vars` entry in the environment. The site URL (`SITE_URL`), the cron secret, and the email and password of the admin that first-run setup created, are in the gitignored `testing-credentials.env` here. It is not named `.env.testing`, because wrangler and Vite load a `.env.<name>` file and a testing build would copy its values into `dist/server/.dev.vars`. It is not in the repository: ask whoever holds it, or set a new cron secret with `wrangler secret put` and create a new admin with `users:create` under `CLOUDFLARE_ENV=testing` and `--allow-remote`.

The admin was created by first-run setup (`POST /cms/api/setup`) right after the first deploy, since until a user exists anyone who reaches `/cms` can create the admin. Sign in with the values in `testing-credentials.env`. If the database is ever emptied, run setup again at once.

`pnpm run check:deployed:cloudflare` from the repo root runs the checks that need this deployment against it (production D1, the real Cron Trigger, the block list across isolates) and prints one pass or fail line per roadmap item. It reads `testing-credentials.env` from the main checkout, so it runs from a worktree too. It writes to the site (a cron tick, two refused sign-ins, a block it removes again, test images it deletes again, cache purges, a draft page it keeps), so it never runs in `verify` or CI. The checks that need a special deploy are run by hand; its header says how, each leaving the deployment as it was.
