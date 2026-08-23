# 0091 — Cloudflare is a runtime integration, and the environment has one reader

**Date:** 2026-08-23
**Status:** accepted

`src/cloudflare/` moves into `src/integrations/cloudflare/` as a runtime integration (sibling to framework integrations, no nesting, no `RuntimeIntegration` interface for one member), and `createWorkerEntry` takes the config as an argument instead of importing Astro's virtual module. All environment reads go through `src/env/` (`resolveEnv`/`getEnv`/`getEnvRecord`/`setEnvSource`); rejected Hono's record-returning `env()`; unset `NODE_ENV` now means production, and a Worker without a named scheduler throws.
