# 0081 — One hook runner; a throw propagates; hooks are not a plugin concept

**Date:** 2026-08-21
**Status:** accepted

One `hooks/` leaf with `addHook`/`runHook`/`hasHook`; a non-`undefined` handler return replaces the payload, and a throw always propagates to the caller with no try/catch. Rejected two name-keyed dispatchers where `:before` substring decided failure semantics and `after*` throws were swallowed and logged; unfired declared events are deleted.
