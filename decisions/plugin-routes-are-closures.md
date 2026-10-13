---
area: structure
---

# A plugin route handler is a closure

A plugin's raw route handler is a function, as its hooks, service methods and cron jobs are, so it captures the plugin's resolved options (`buildBackupRoutes(keep)` in `packages/plugins/backups/src/routes/backups.ts`).

**Why:** services read registries at call time, so no route depends on anything that fails in plain Node.

**Rejected:** an `entrypoint` module specifier compiled into a generated module, as Astro's `injectRoute` takes (a second mechanism for one surface, and a new `ctx.options` for what a closure already captures).
