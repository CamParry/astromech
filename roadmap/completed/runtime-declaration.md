# Runtime Declaration: Declared, Inherited, or Detected

Asked whether Astromech needs to be told which runtime it is on, and if so,
where that declaration lives: its own config, Astro's adapter, or nowhere.

## Outcome

Nothing is declared. The entry a site deploys already says which runtime it is,
and `DECISIONS.md` records why that beat the three options this file weighed:
detect, declare in the config, or inherit from the framework.

What settled it, checked against astro 6.4.8 and `@astrojs/cloudflare` 13.7.0 on
2026-09-15:

- **The adapter seam is gone.** `context.locals.runtime.env` throws in Astro 6,
  and the adapter points to `import { env } from 'cloudflare:workers'` instead,
  so the environment cannot be inherited from Astro's middleware.
- **Vars already reach `resolveEnv` on Workers.** At the demo's compatibility
  date workerd fills `process.env` from wrangler `vars` and secrets, and
  `resolveEnv` reads `process.env`. `astro dev` against `apps/demo-cloudflare`
  serves `/` and `/cms` with 200 and the API with 401.
- **The Worker entry already nominates the scheduler.** `createWorkerEntry`
  calls `setDefaultScheduler(cloudflareCron)` and supplies the bindings through
  `setEnvSource`. A Worker without it and without a configured scheduler fails
  with an error naming both fixes, and Node falls through to the in-process
  ticker.
- **A `runtime` key would refuse a working setup.** Its strongest job was
  refusing `d1({ binding })` off Workers, which works in Node through wrangler's
  platform proxy.
- **`cloudflare:workers` stays out of core.** It resolves only inside a workerd
  bundle, and core also loads in plain Node for the CLI and the build.
