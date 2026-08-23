# 0033 — The repo resolves `src`, npm gets `dist`

**Date:** 2026-08-09
**Status:** accepted

`packages/astromech/package.json` carries dual exports maps (Payload 4's pattern), `exports` pointing Vite-loaded subpaths at `./src/…` and `publishConfig.exports` restoring `./dist/…` at pack time, so `apps/demo` needs no root build for a core edit. Only Vite-loaded subpaths can move: the config half loads in plain Node with no alias or TS. `astromech/local` and `astromech/middleware` moved together because splitting them would duplicate `PLUGIN_TABLES` and `PUBLIC_BRAND` module state and make the public-brand write guard fail open; `check:exports` guards the two maps drifting.
