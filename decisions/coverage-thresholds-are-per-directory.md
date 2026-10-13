---
area: toolchain
---

# Coverage thresholds are per directory

Each package's vitest config sets a coverage threshold per directory, one point below what it measured, and a threshold is only ever raised (`packages/astromech/vitest.config.ts`).

**Rejected:** one global number (its average hides a directory near zero).
