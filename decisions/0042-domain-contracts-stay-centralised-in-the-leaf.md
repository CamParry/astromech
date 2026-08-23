# 0042 — Domain contracts stay centralised in the types leaf

**Date:** 2026-08-10
**Status:** accepted
**Supersedes:** 0039, in the step 2 claim only — everything else in that record stands

The five domain service contracts stay in the `types/` leaf; 0039's "contract lives with its implementing layer" does not transfer because Astromech's innermost layer is `types/` and the contracts have cross-layer fan-in. Rejected moving them with a `dependencyTypesNot: ['type-only']` exemption and redesigning `PluginContext` around narrower ports; query primitives split into `types/query.ts`.
