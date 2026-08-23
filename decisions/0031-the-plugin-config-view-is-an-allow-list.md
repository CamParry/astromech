# 0031 — The plugin config view is an allow-list

**Date:** 2026-08-09
**Status:** accepted
**Supersedes:** 0030 in part (its reasoning for the `ai` strip)

`ctx.config` is an explicit `Pick` of fifteen `ResolvedConfig` fields built field by field, not a spread, because live config (0030) turned `ctx.config.storage.put` and `ctx.config.email.driver.send` into working functions that bypass `ctx.storage`'s key prefix; rejected extending `resolveConfig`'s strip list, which leaves new fields visible by default. `resolveConfig` can't wrap models itself because `buildAIConfig` is async and the virtual module's default export is top-level.
