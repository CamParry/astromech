# Deploying to Cloudflare Workers

Astromech runs on Workers with the same standing as Node. Every backend has a
Cloudflare driver, and the only extra code a site writes is one entry file.

`apps/demo-cloudflare` in the repository is a working example of everything
below, verified against wrangler's local emulation by
`pnpm run check:boot:cloudflare`.

## What you declare, and where

There is no `runtime` setting. Astromech never asks which platform it is on:
the platform is implied by the drivers you name, and a separate declaration
could only disagree with them.

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import { d1 } from 'astromech/database/d1';
import { cloudflareImages } from 'astromech/media/image/cloudflare';
import { r2 } from 'astromech/storage/r2';

export default defineConfig({
    db: d1({ binding: 'DB' }),
    storage: r2({ binding: 'MEDIA' }),
    media: { image: { driver: cloudflareImages() } },
    // No `scheduler`: the Worker entry below nominates `cloudflareCron()`.
});
```

`cloudflareImages()` transforms through Cloudflare Image Transformations, so
turn them on for the zone. The driver fetches each original from your site's
media route, so if the zone allows transformations only from listed origins,
list your site's hostname. Otherwise every variant request is served the
original, and the Worker logs `Cloudflare image transform failed: 403`
(Cloudflare's error 9401).

Drivers name a **binding**, not an object, because the same config file is also
loaded by plain Node when the CLI runs. The binding is looked up lazily, on the
first query rather than at construction.

## The Worker entry

A Cron Trigger fires `scheduled()` and never `fetch()`, and the Astro adapter's
entry exports only `fetch`. `createWorkerEntry` returns both handlers from one
file:

```ts
// src/worker.ts
import astro from '@astrojs/cloudflare/entrypoints/server';
import { createWorkerEntry } from 'astromech/cloudflare';
import config from '../astromech.config';

export default createWorkerEntry(astro, { config });
```

`fetch` is the adapter's, passed through unchanged. `scheduled` creates the
application if the tick is the first thing the isolate runs. Both register the
Worker's `env`, which is where the D1 and R2 bindings and every string variable
come from — so this file is not optional. Without it nothing supplies the
environment, and the first binding lookup fails saying so.

The config is passed in rather than read from an Astro virtual module, so the
same entry works under any framework whose server entry exports `fetch`.

## wrangler.jsonc

```jsonc
{
    "name": "my-site",
    "main": "src/worker.ts",
    "compatibility_date": "2026-08-27",
    "compatibility_flags": ["nodejs_compat"],
    "assets": { "directory": "./dist/client" },
    // Only the poke. Each job's own `schedule` decides whether a tick runs it.
    "triggers": { "crons": ["* * * * *"] },
    "d1_databases": [{ "binding": "DB", "database_name": "my-site", "database_id": "…" }],
    "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "my-site-media" }],
}
```

Use a `compatibility_date` of 2026-02-19 or later. With `nodejs_compat`, Astro
streams a page as an async iterable, which a Worker accepts as a response body
only from that date; before it, every page renders as `[object Object]`.

`main` points at your entry file, not at
`@astrojs/cloudflare/entrypoints/server`. The Astro build compiles it into
`dist/server/entry.mjs` and writes a `dist/server/wrangler.json` carrying your
bindings across.

## Environment variables

On Workers, string variables and object bindings arrive in the same `env`
object. `resolveEnv('MY_VAR')` reads the `vars` section of your wrangler config
and the secrets you have set; `resolveBinding('DB')` reads the bindings. Both
come from the environment the entry registered.

`NODE_ENV` does not exist in a Worker. Astromech treats anything other than an
explicit `development` as production, so error responses carry no exception
detail unless you set it deliberately.

Set `BETTER_AUTH_SECRET` as a secret, not in `vars`, which sit in plain text in
your wrangler config. Generate a value and store it:

```
openssl rand -base64 32
npx wrangler secret put BETTER_AUTH_SECRET
```

Until it is set, Astromech refuses every request, because Better Auth would
otherwise sign sessions with a built-in secret that anyone can read. Running it
locally, below, covers `wrangler dev`.

With `security.captcha` set, store its secret the same way, with
`npx wrangler secret put ASTROMECH_CAPTCHA_SECRET`; without it Astromech refuses
every request in production
([../configuration/security.md](../configuration/security.md#captcha)).

## Migrations

Migrations are applied by command, never on boot. `db:generate` never opens
the database. `db:init` and every other command that opens one reaches D1 the
way your Worker's code would in `wrangler dev`: through wrangler's
`getPlatformProxy()`, which reads the `wrangler.jsonc` in the directory you run
the command from (and the environment `CLOUDFLARE_ENV` names). A binding is
wrangler's local emulation, kept under `.wrangler/state`, unless its entry sets
`"remote": true`; then the command reaches the database on Cloudflare, which
needs `wrangler login` or a `CLOUDFLARE_API_TOKEN`.

```
astromech db:generate
astromech db:init                  # local emulation
```

The CLI refuses to open a remote database unless you pass `--allow-remote`. It
counts a D1 binding as remote when it sets `"remote": true`, and also when it
cannot tell: when wrangler is not installed, the config cannot be read or does
not declare the binding, or the config passes `d1({ database })` an object
rather than a binding name. To migrate production, point a binding at the
production database and mark it remote, in its own wrangler environment so
everyday commands stay local:

```jsonc
{
    "d1_databases": [{ "binding": "DB", "database_name": "my-site", "database_id": "…" }],
    "env": {
        "production": {
            "d1_databases": [
                {
                    "binding": "DB",
                    "database_name": "my-site",
                    "database_id": "…",
                    "remote": true,
                },
            ],
        },
    },
}
```

```
CLOUDFLARE_ENV=production astromech db:init --allow-remote
```

`astro build` applies migrations too, but only to a local database: a build
under `CLOUDFLARE_ENV=production` logs that the database is remote and applies
none, so run `db:init` first.

A Worker cannot read files, so it takes its migrations from your config's
`migrations` key, which the build bundles
([../data/migrations.md](../data/migrations.md#the-migrations-folder)). The
first request or Cron Trigger a Worker handles compares them with the database
and logs a warning when migrations are pending. The
Worker still serves the request or runs the due jobs
([../configuration/scheduler.md](../configuration/scheduler.md#how-scheduling-works)).

## Deploying

Run these from the directory that holds `wrangler.jsonc`, naming the wrangler
environment you deploy (`production` here) in each:

```
CLOUDFLARE_ENV=production npx astromech db:init --allow-remote
CLOUDFLARE_ENV=production npx astro build
npx wrangler deploy --env production
```

- **The build picks the environment.** Astro's Cloudflare adapter builds
  through the
  [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/),
  which reads `CLOUDFLARE_ENV` at build time and writes
  `dist/server/wrangler.json` flattened to that one environment: its name,
  bindings, routes and `vars`. A build without it carries the top-level config.
- **`wrangler deploy` deploys what the last build wrote.** The build leaves
  `.wrangler/deploy/config.json` pointing at `dist/server/wrangler.json`, and
  `wrangler deploy` follows it
  ([generated configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#generated-wrangler-configuration)).
  `--env` does not choose the environment then: after a build for
  `production`, `--env production` only checks that the build matches and any
  other name is refused; after a build without `CLOUDFLARE_ENV`, `--env` is
  ignored and the top-level Worker is deployed. So build for the environment
  right before you deploy it.
- **`nodejs_compat` is required.** The adapter bundles a `process` polyfill
  that imports `node:events`, and Astromech imports `node:async_hooks`. Without
  the flag, Cloudflare refuses the upload with `No such module "node:events"`.
- **Turn Astro sessions off.** Unless the Astro config sets `session: false`
  or names a session driver, the adapter turns on Astro sessions stored in a
  KV binding named `SESSION`, and `wrangler deploy` creates a KV namespace for
  it. Astromech does not use Astro
  sessions (its sign-in sessions live in the database), so unless your own
  pages do, set `session: false`:

    ```js
    // astro.config.mjs
    export default defineConfig({
        adapter: cloudflare(),
        session: false,
        // …
    });
    ```

Secrets belong to an environment too: set them with
`npx wrangler secret put BETTER_AUTH_SECRET --env production`. They survive
deploys.

## Running it locally

```
pnpm run build
npx wrangler dev -c dist/server/wrangler.json --local --env-file "$PWD/.dev.vars"
```

`.dev.vars` beside your `wrangler.jsonc` holds local secrets, one per line as
`BETTER_AUTH_SECRET=…`; keep it out of git. Wrangler looks for `.dev.vars` beside
the config it runs, which with `-c` is inside the build output, so the file is
passed with `--env-file`.

The build puts a copy there too. The
[Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/),
which Astro's adapter builds through, writes your `.dev.vars`, or with none every
variable in your `.env` files, to `dist/server/.dev.vars` for `wrangler dev` to
read. `wrangler deploy` does not upload it, but it holds your secrets, so keep
`dist/` out of git and out of any archive you share. Two settings narrow it
([secrets](https://developers.cloudflare.com/workers/configuration/secrets/)):

- `secrets.required` in `wrangler.jsonc` lists the secrets your Worker needs,
  and only those are copied. Wrangler then also reads them from your shell, and
  `wrangler deploy` expects each one to be set.
- `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` in the build's environment
  leaves `.env` out, so only a `.dev.vars` file is copied.

The build applies migrations when it starts, before it prerenders anything,
through wrangler's `getPlatformProxy()`, which writes local state next to your
wrangler config. It skips a binding marked `"remote": true`, as
[Migrations](#migrations) says. `wrangler dev` keeps its own
state beside whichever config file it was given, so pointing it at
`dist/server/wrangler.json` needs `--persist-to` at the directory the build
used, or the Worker boots against an empty database.

Cron Triggers do not fire automatically in local development. Poke one by hand:

```
curl "http://localhost:8787/cdn-cgi/local/scheduled"
```

## Other platforms

Node and Vercel need no Astromech code at all, and [node.md](node.md) covers
running the build on Node. Name `libsql()` or `s3()`, and
for scheduled work use `interval()` on a long-lived Node host or `webhook()` on
Vercel, pointing a Vercel Cron Job at `/cms/api/cron/run` as
[../configuration/scheduler.md](../configuration/scheduler.md#webhook--an-external-poke)
describes. Cloudflare needs an integration because bindings
and `scheduled()` are both things no other platform has.
