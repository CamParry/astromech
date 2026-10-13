---
area: structure
---

# Only the browser boundary is checked

The layer model in `ARCHITECTURE.md` is convention. The browser boundary is checked: lint keeps the admin to `astromech/shared`, `astromech/fetch` and type imports, and `packages/astromech/tests/exports/shared-browser.test.ts` fails on a Node builtin or an unlisted core file in the browser bundle. [Lint and type checks](../roadmap/planned/lint-and-type-checks.md) plans a test that allows no import cycle.

**Rejected:** dependency-cruiser (a growing exemption list); eslint `import/no-cycle`; a `@astromech/shared` package (does not enforce itself, Directus #26613); a `browser` export condition (the Cloudflare server build may pick it up); a `*.shared.ts` suffix.
