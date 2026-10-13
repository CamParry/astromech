---
area: structure
---

# Plugins reach core only through `ctx`

A plugin reaches core's running application through `ctx`, the `AppContext` built for it with its identity and prefixed storage (`packages/astromech/src/plugins/runtime/plugin-runtime.ts`). Its entry imports only published subpaths that load in plain Node, since the config is also evaluated outside Vite (`pnpm run check:node-imports`).

**Why:** a method runs as the context it is given, so an imported service would have nothing to run as.

**Rejected:** resolving `virtual:` modules from a plugin's entry through `ssr.noExternal` (no effect), Node module hooks (process-wide, two copies of core) or loader injection (needs the host to load plugins).
