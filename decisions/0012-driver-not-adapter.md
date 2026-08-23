# 0012 — "Driver" over "adapter" for pluggable backends

**Date:** 2026-08-04
**Status:** accepted

Pluggable backends are "drivers" (`DatabaseDriver`, `StorageDriver`, `EmailDriver`), not "adapters", chosen for consistency with the already-shipped `DatabaseDriver` and because these own a connection to an external system rather than reshaping a mismatched interface; "adapter" is reserved for internal interface reshaping such as `tableStorage`.
