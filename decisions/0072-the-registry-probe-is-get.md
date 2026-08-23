# 0072 — The registry probe is `get`, and the throwing read is `getOrThrow`

**Date:** 2026-08-19
**Status:** accepted
**Supersedes:** 0069 (the probe half only; the flat `build` sequence stands)

Registry read is `get(): T | null` (nullable, per `Map.prototype.get`) and `getOrThrow()` (per Kysely's `executeTakeFirstOrThrow`); `maybeGet` deleted, reversing 0069's call-site-count argument since `strict: true` turns missed sites into build errors. Rejected `requireGet`, `getOrFail`, `getStrict`, `unwrap`.
