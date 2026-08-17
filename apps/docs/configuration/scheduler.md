# Scheduled jobs

How Astromech runs cron jobs: what drives a tick on each runtime, the
`scheduler` config key and the three built-in drivers, and the wiring a
Cloudflare Worker needs. Declaring a job itself is a plugin concern — see
[../plugins/authoring.md](../plugins/authoring.md).

## How scheduling works

A job's cadence lives in the database, not in deploy config, so an admin can
edit a schedule without a redeploy. Whatever triggers the scheduler is a dumb
frequent ticker: every trigger converges on the same contract, a frequent poke
into core's due-evaluation, which fires only the jobs whose stored schedule is
due. A job's declared `schedule` is a seed written on first boot; the stored
row wins thereafter.

That is why trigger cadence and job cadence are independent: ticking every
minute does not run every job every minute, it gives due-evaluation a
once-a-minute chance to fire what is due.

## Picking a driver

The `scheduler` key in `astromech.config.ts` takes a driver. Leave it unset
and Astromech picks by runtime: the in-process `interval()` ticker everywhere,
except on Cloudflare Workers, where the default is `cloudflareCron()` because
a Worker cannot own a timer — platform cron drives it instead.

```ts
import { webhook } from 'astromech/scheduler/webhook';

export default defineConfig({
    // ...
    scheduler: webhook(),
});
```

### `interval()` — in-process timer

`astromech/scheduler/interval`. Ticks once a minute from the serving process.
The default when nothing else supplies one, and the right choice for any
long-running host. The timer never holds the event loop open, and repeated
boots never stack timers.

### `cloudflareCron()` — Cloudflare Cron Triggers

`astromech/scheduler/cloudflare`. The driver itself is a no-op declaration:
the tick comes from the platform, through the Worker's `scheduled()` handler.
`createWorkerEntry` selects it for you, so naming it in the config is only
needed if you write the Worker entry by hand. Wire both halves:

1. Give the Worker a frequent cron trigger in `wrangler.jsonc` — frequent,
   because it is only the poke; real cadence is due-evaluation's:

    ```jsonc
    {
        "triggers": { "crons": ["* * * * *"] },
    }
    ```

2. Build the Worker entry with `createWorkerEntry`. It returns both handlers:
   `fetch` is the Astro adapter's, unchanged, and `scheduled` creates the
   Astromech application if the tick is the first thing the isolate runs — a
   cron trigger fires `scheduled()`, never `fetch()`, so it cannot rely on a
   request having created anything:

    ```ts
    // src/worker.ts
    import astro from '@astrojs/cloudflare/entrypoints/server';
    import { createWorkerEntry } from 'astromech/cloudflare';

    export default createWorkerEntry(astro);
    ```

    Point `main` in `wrangler.jsonc` at that file instead of at
    `@astrojs/cloudflare/entrypoints/server`.

### `webhook()` — an external poke

`astromech/scheduler/webhook`. No in-process ticker; something outside the
process POSTs `/cron/run` on whatever cadence it likes (a system crontab, an
uptime pinger, a serverless cron). The route accepts an admin session, or a
shared-secret bearer token for sessionless pokes:

```bash
export ASTROMECH_CRON_SECRET=…   # on the server; the route is off until set

curl -X POST https://example.com/cms/api/cron/run \
    -H "Authorization: Bearer $ASTROMECH_CRON_SECRET"
```

## Writing your own

A driver is two functions: `start(onTick)`, called once at boot, and an
optional `stop()`. A driver that owns no trigger (like `cloudflareCron()` and
`webhook()`) makes `start` a no-op — selecting it just declares where ticks
come from.
