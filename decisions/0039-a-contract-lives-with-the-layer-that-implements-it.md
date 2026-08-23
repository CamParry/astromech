# 0039 — A contract lives with the layer that implements it, and the plugin context is why the domain contracts cannot follow

**Date:** 2026-08-09
**Status:** accepted

`AstromechClient` moves from `types/client.ts` to `transport/astromech-client.shared.ts` (beside its two implementations), with the typed-entry surface and plugin types split into leaf files and `plugins/runtime/client-access.ts` declaring a leaf-typed port instead of importing the client. Moving the five domain service contracts to their domains stopped, because it would need two new carve-outs; `types/index.ts` keeps `export *`.
