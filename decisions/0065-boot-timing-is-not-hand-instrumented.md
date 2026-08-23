# 0065 — Boot timing is not hand-instrumented

**Date:** 2026-08-19
**Status:** accepted
**Supersedes:** 0064 (the boot-timing sub-point only)

Remove per-step boot stopwatch instrumentation and delete `utilities/timing.ts`; use a profiler (`node --cpu-prof`, `clinic flame`) or platform cold-start analytics instead. Rejected an env-gated stopwatch and a global ambient timing framework with no second consumer.
