# 0070 — Drop dependency-cruiser

**Date:** 2026-08-19
**Status:** accepted
**Supersedes:** 0036

Remove dependency-cruiser, its config, `lint:deps` and the CI step; the layer list stays as documented convention in `ARCHITECTURE.md`. It cost more than it caught (three ports guarding no real cycle, eight exemptions/hand-written rules, `no-circular` excluding the domains); the browser boundary is covered by `check:boot`'s headless load until the admin becomes its own package. Rejected a browser-only config, eslint `import/no-cycle`, and case-by-case relaxation.
