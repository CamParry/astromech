# 0035 — One namespace, one `declare global`, and a keyed registry beside the single-value one

**Date:** 2026-08-09
**Status:** accepted

Ten hand-rolled `globalThis.__astromechX` globals folded into the single `__astromech` namespace, with `utilities/registry.ts` holding core's only `declare global`, enforced by an eslint `no-restricted-syntax` selector scoped to core's `src`. `createKeyedRegistry` added as a second shape rather than generalising `createRegistry`; entry storage splits into two slots while `pluginRuntime` stays one record (its five fields are rewritten atomically); five non-registry guards stay plain typed keys reached through `globals()`.
