# 0050 — Every published package states and enforces the Node floor

**Date:** 2026-08-15
**Status:** accepted

All eight published packages (not just two) declare `engines.node: ">=22.13.0"`, `@types/node` drops from `^25.x` to `^22.20.1`, tsup configs get `target: "node22"`, `.nvmrc` names 24. Rejected relying on peer-dependency inheritance for the floor and pinning `.nvmrc` to 22.
