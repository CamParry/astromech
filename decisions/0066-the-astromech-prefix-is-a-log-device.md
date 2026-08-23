# 0066 — The `[Astromech]` prefix is a log device, not part of an error

**Date:** 2026-08-19
**Status:** accepted

`[Astromech]` is removed from ~40 error message strings and lives only in `utilities/log.ts`; thrown errors identify via `AstromechError.name`, wire-mapped domain errors keep clean messages so the marker never leaks into HTTP bodies. Rejected a throw-helper that prepends the prefix (same leak, centralised).
