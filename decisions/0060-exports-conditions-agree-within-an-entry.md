# 0060 — An `exports` entry's `types` and `default` resolve into the same tree

**Date:** 2026-08-17
**Status:** accepted

An `exports` entry's `types` and `default` must resolve into the same tree (both `dist` or both `src`), enforced by `check-exports-parity.mjs`; never compare targets across the repo/publish maps. Rejected moving `types` to `src` via relative specifiers, de-aliasing 825 `@/` specifiers, or Node `#src/*` subpath imports.
