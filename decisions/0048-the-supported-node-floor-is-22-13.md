# 0048 — The supported Node floor is 22.13

**Date:** 2026-08-15
**Status:** accepted

`engines.node` moves from `>=20.0.0` to `>=22.13.0` and CI runs Node 22, since pnpm 11 requires 22.13 and an untested range is a promise nothing backs. Rejected keeping `>=20.0.0` unverified and running the test suite separately under Node 20; plugin packages still declare no `engines`.
