# 0069 — The build sequence is flat, and the registry probe is `maybeGet`

**Date:** 2026-08-19
**Status:** accepted
**Supersedes:** 0067, 0068

Registry probe settles on `maybeGet` (and `maybeGetDatabaseDriver`), rejecting `tryGet` (implies TryGetValue/out-param) and `safeGet` (implies zod's result object); `build` runs the boot sequence inline and `registrations.ts` is deleted, keeping only `registerBuiltInJobs` as the per-domain extension point. [Probe name superseded by 0072.]
