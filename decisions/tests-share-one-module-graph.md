---
area: toolchain
---

# Tests share one module graph per worker

Core and the admin run vitest on `pool: 'threads'` with `isolate: false`. A file that mocks a module or writes a shared global opts back into isolation through `packages/astromech/tests/_support/isolated-tests.ts`, which `packages/astromech/tests/isolation-list.test.ts` checks. The plugins run on threads but keep per-file isolation: their suites take seconds, and half of them mock.

**Rejected:** the default `forks` pool (rebuilds the graph per file); vitest's `*.non-isolated.test.ts` suffix (inverted, when most files are safe); one root workspace (no faster; breaks tests that find config from the working directory).
