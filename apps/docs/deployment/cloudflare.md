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
    "compatibility_date": "2026-02-14",
    "compatibility_flags": ["nodejs_compat"],
    "assets": { "directory": "./dist/client" },
    // Only the poke. The real cadence lives in the `_astromech_cron` table, so
    // an admin can change a schedule without a deploy.
    "triggers": { "crons": ["* * * * *"] },
    "d1_databases": [{ "binding": "DB", "database_name": "my-site", "database_id": "…" }],
    "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "my-site-media" }],
}
```

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

## Migrations

Migrations are applied by command, never on boot. D1 reports itself remote
whether it is the real database or wrangler's local emulation, and the CLI
refuses a remote database by default, so both commands need `--allow-remote`:

```
astromech db:generate --allow-remote
astromech db:init --allow-remote
```

## Running it locally

```
pnpm run build
npx wrangler dev -c dist/server/wrangler.json --local
```

The build applies migrations through wrangler's `getPlatformProxy()`, which
writes local state next to your wrangler config. `wrangler dev` keeps its own
state beside whichever config file it was given, so pointing it at
`dist/server/wrangler.json` needs `--persist-to` at the directory the build
used, or the Worker boots against an empty database.

Cron Triggers do not fire automatically in local development. Poke one by hand:

```
curl "http://localhost:8787/cdn-cgi/local/scheduled"
```

## Other platforms

Node and Vercel need no Astromech code at all. Name `libsql()` or `s3()`, and
for scheduled work use `interval()` on a long-lived Node host or `webhook()` on
Vercel, pointing a Vercel Cron entry at `/cms/api/cron/run` with
`ASTROMECH_CRON_SECRET` set. Cloudflare needs an integration because bindings
and `scheduled()` are both things no other platform has.
