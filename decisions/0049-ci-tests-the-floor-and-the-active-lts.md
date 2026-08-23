# 0049 — CI tests the floor and the Active LTS

**Date:** 2026-08-15
**Status:** accepted

Test and Boot jobs run on Node 22 and 24 (floor plus Active LTS) with `fail-fast` off; Lint/Type Check/Build stay on 24 only since eslint/tsc/tsup output is version-independent. Node 20 unavailable: pnpm 11 requires >=22.13.
