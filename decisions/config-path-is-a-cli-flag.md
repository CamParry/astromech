---
area: config
---

# A moved config is found with `--config`

The same path goes to the integration's `configFile` option and the CLI's `--config` flag (`packages/astromech/src/transport/cli/common-args.ts`). The migrations folder is the `migrationsDir` config key, resolved against the working directory like every other path.

**Rejected:** the CLI reading `astro.config.mjs` (ties it to Astro); a `package.json` field; an environment variable (a `.env` the config loads cannot set it); resolving paths next to the config file (the built server cannot).
