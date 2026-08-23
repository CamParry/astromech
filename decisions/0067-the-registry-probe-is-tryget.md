# 0067 — The registry probe is `tryGet`, not `peek`

**Date:** 2026-08-19
**Status:** superseded by 0069

Registry probe renamed `peek` → `tryGet` (and `peekDatabaseDriver` → `tryGetDatabaseDriver`), keeping `get` as the throwing read since it has 135 sites against 14 probes. Rejected Map semantics (`get` returns null, `require`/`getOrThrow` throws) and `find`. Superseded by 0069.
