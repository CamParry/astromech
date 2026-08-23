# 0007 — how plugin code reaches core

**Date:** 2026-08-04
**Status:** accepted

Plugins are loaded by plain Node at Astro config time and cannot resolve `virtual:astromech/config`, so `ctx` (capability injection) is the only bridge to core and a plugin may import only `astromech` and `astromech/ui`, making `astromech/methods` core-internal. Rejects `ssr.noExternal` (tried, no effect), Node module customization hooks (process-wide, deprecated, would yield two core copies) and VS Code-style loader injection (needs the host to load plugins); `rawRoutes` entrypoint injection deferred.
