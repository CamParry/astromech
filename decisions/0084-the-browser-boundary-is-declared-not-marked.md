# 0084 — The browser boundary is declared, not marked

**Date:** 2026-08-22
**Status:** accepted

The browser-safe surface will be declared via an `exports/shared.ts` entrypoint plus a `"browser"` condition, retiring the unenforced `*.shared.ts` suffix; rejected a `@astromech/shared` package and re-adding lint rules. Blocked until `integrations/astro/vite.ts` stops aliasing `@/` to all of `src/`, so the suffix stays for now.
