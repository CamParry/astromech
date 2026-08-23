# 0047 — pnpm is the package manager

**Date:** 2026-08-15
**Status:** accepted

The repo moves from npm workspaces to pnpm, pinned by `packageManager`, because npm's flat `node_modules` hid roughly thirty undeclared dependencies that would break on publish; internal deps become `workspace:*`, and `publicHoistPattern` deliberately re-hoists the admin's client deps (kept in step with `optimizeDeps.include`) plus `libsql`. Rejected staying on npm, Yarn and Bun.
