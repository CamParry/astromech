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

Every build also copies `.env` into `dist/server/.dev.vars`, `ANTHROPIC_API_KEY` included. The Cloudflare Vite plugin does that for `wrangler dev` over the build, which is how `pnpm run preview` gets the variables, and `wrangler deploy` does not upload it ([Cloudflare's docs](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)). `dist/` is gitignored, so it goes nowhere else. It is left on: `secrets.required` in `wrangler.jsonc` would narrow the copy, but it also makes `wrangler deploy` require each listed secret and must be repeated in the `testing` environment, and `check:boot:cloudflare` passes its secret with `--env-file`, so it needs no copy. `apps/docs/deployment/cloudflare.md` ("Running it locally") has both settings that narrow it.

## What is Cloudflare-specific here

- `src/worker.ts`: `createWorkerEntry(astro, { config })` exports `fetch` and `scheduled` and registers the Worker's `env`. `main` in `wrangler.jsonc` points at it.
- `wrangler.jsonc`: the D1 and R2 bindings the config names, and a `* * * * *` trigger. Each job's own `schedule`, synced into `_astromech_cron` every tick, decides whether a tick runs it.
- `astromech.config.ts` names no `scheduler`: `createWorkerEntry` supplies `cloudflareCron()`.
- Workers Caching (`cache` in `wrangler.jsonc`) with Astro's `cacheCloudflare()` provider and a route rule storing every page for a minute (`astro.config.mjs`), so Astromech's `cache.set(false)` on its own routes is what keeps them out. `src/pages/api/invalidate.ts` purges cache tags for a signed-in user: a Worker's cache is purged only from inside the Worker.
- `src/pages/[slug].astro` renders a page entry, and with `?preview=<token>` makes the preview read no cache may store.

## The gate

`pnpm run check:boot:cloudflare` from the repo root builds this app with Astro's `security.csp` on (`SECURITY_CSP=1`), serves it on workerd and asserts `/`, `/cms` and the hashes of its inline scripts in its policy, `/cms/api/entries/post`, a `scheduled()` tick and four sign-ins from one address (three refused passwords, then the rate limit). The sign-ins run last: the script says why. It is too slow for the pre-commit hook, so run it by hand after anything touching the Cloudflare path.

## Testing deployment

A permanent deployment on the Paragram Cloudflare account, for the checks only a real Worker can run: production D1, Cron Triggers, `cf.image` and the Cache API (which needs a custom domain). It is the `testing` environment in `wrangler.jsonc`.

- URL: https://astromech-testing.paragramagency.com (a Workers custom domain on the `paragramagency.com` zone; `workers_dev` is off, so there is no `workers.dev` URL)
- The zone limits Image Transformations to listed source origins, and `cloudflareImages()` transforms only when this hostname is on that list (the zone's `transformations_allowed_origins` setting). Off it, every variant request is served the original.
- Worker `astromech-demo-cloudflare-testing`, D1 database `astromech-testing`, R2 bucket `astromech-testing-media`

Redeploy with `pnpm run deploy:testing` in this directory, after `wrangler login` to the account. It first builds the workspace packages this app depends on (`pnpm -F "astromech-demo-cloudflare^..." build`), since the app imports their `dist`: a deploy from a checkout whose build of `astromech` predated the bundled migration names failed with `"migrationNames" is not exported by "\0virtual:astromech/config"` (2026-10-13). The names were then a `migrationNames` export of that virtual module; they are now the `__ASTROMECH_MIGRATION_NAMES__` define that `resolveBundledMigrationNames` reads. The script then migrates the remote database (`CLOUDFLARE_ENV=testing`, `db:init --allow-remote`, as `apps/docs/deployment/cloudflare.md` describes), builds for the `testing` environment and runs `wrangler deploy --env testing`. The build applies no migrations under `CLOUDFLARE_ENV=testing`, because the binding there is remote. Never run `wrangler deploy` by itself: it deploys whatever config the last build wrote to `dist/server/wrangler.json` and ignores `--env`, so after a plain `pnpm run build` or `check:boot:cloudflare` it would deploy the local configuration as a Worker named `astromech-demo-cloudflare`.

`wrangler tail --env testing` and `wrangler secret put --env testing` read `wrangler.jsonc` itself, so they reach this Worker whatever the last build was.

The Worker's secrets, `BETTER_AUTH_SECRET`, `ASTROMECH_CRON_SECRET` and `ASTROMECH_CAPTCHA_SECRET`, are set with `wrangler secret put --env testing` and survive deploys. `BETTER_AUTH_URL` is a plain `vars` entry in the environment. The site URL (`SITE_URL`), the cron secret, the email and password of the admin that first-run setup created, and the Turnstile widget's keys (`TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET`, a managed widget named `astromech-testing` limited to this hostname) are in the gitignored `testing-credentials.env` here. It is not named `.env.testing`, because wrangler and Vite load a `.env.<name>` file and a testing build would copy its values into `dist/server/.dev.vars`. It is not in the repository: ask whoever holds it, or set a new cron secret with `wrangler secret put` and create a new admin with `users:create` under `CLOUDFLARE_ENV=testing` and `--allow-remote`.

The admin was created by first-run setup (`POST /cms/api/setup`) right after the first deploy, since until a user exists anyone who reaches `/cms` can create the admin. Sign in with the values in `testing-credentials.env`. If the database is ever emptied, run setup again at once.

### Captcha runs

Every check in `check:deployed:cloudflare` signs in with no token, so the site has a captcha only during a captcha run. `astromech.config.ts` sets `security.captcha` only when `CAPTCHA_PROVIDER` and `CAPTCHA_SITE_KEY` are set, and `astro.config.mjs` then sends the content security policy the docs give for that provider. The config is read twice: by the build, in Node, which puts the site key in the admin's bundle, and by the Worker at runtime, where `process.env` holds the Worker's vars. Both must see the same values, so `pnpm run deploy:testing:captcha` takes them from the environment for the build and passes them to `wrangler deploy` with `--var`. Run `pnpm run deploy:testing` with neither set: a build with them and a Worker without would render a widget that nothing checks. A deploy without `--var` drops the vars, so it turns the captcha off on both sides.

`pnpm run check:deployed:cloudflare --captcha turnstile` makes the whole round, with the provider's keys from `testing-credentials.env`: it sets `ASTROMECH_CAPTCHA_SECRET` to the provider's secret, deploys with the captcha, runs its checks and deploys without it, whatever failed. The secret stays set and does nothing while the captcha is off. The script's header lists what is checked by hand in a real browser.

### The deployed checks

`pnpm run check:deployed:cloudflare` from the repo root runs the checks that need this deployment against it (production D1, the real Cron Trigger, the block list across isolates) and prints one pass or fail line per roadmap item. It reads `testing-credentials.env` from the main checkout, so it runs from a worktree too. It writes to the site (a cron tick, two refused sign-ins, a block it removes again, test images it deletes again, cache purges, a draft page it keeps), so it never runs in `verify` or CI. The checks that need a special deploy are run by hand; its header says how, each leaving the deployment as it was.
