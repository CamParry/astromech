# 0045 — The asset root stays declared, not inferred

**Date:** 2026-08-11
**Status:** accepted

An app-local plugin keeps declaring `root: import.meta.url`, because `definePlugin` cannot infer its caller's module URL and the alternatives (stack-trace parsing, build-time transforms) mis-resolve silently across bundlers; published packages resolve assets via `./admin/*` exports subpaths instead, so `@astromech/forms`' stray `root` was removed.
