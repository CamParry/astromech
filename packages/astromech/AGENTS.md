# packages/astromech

The published `astromech` core.

- **Imports point down the layer model** (`ARCHITECTURE.md`, "The layer model"). Nothing enforces the direction ([Only the browser boundary is checked](../../decisions/only-browser-boundary-is-checked.md)), so keep it by hand, and raise a wanted upward import as a design question rather than working around it.
- **Tests live in `tests/`, mirroring `src/`.** A hand-written route handler is tested through the real router; a route-table row needs no test of its own.
- **Test files share one module graph per worker.** A test that mocks a module, resets the module registry, stubs a global or writes `globalThis.__astromech` must be listed in `tests/_support/isolated-tests.ts`; `tests/isolation-list.test.ts` fails if it is not. To start from empty registries, call the harness's `resetRuntime()` (or `createTestDb()`, which calls it) rather than writing the namespace.
- **A test that starts wrangler's local emulation keeps its own wrangler state**, since two files sharing one race. An in-process file calls `enterWranglerProject()` from `tests/_support/wrangler.ts` and is listed in `wranglerTests` in `vitest.config.ts`; a CLI child runs with `cwd` set to a `createWranglerProject()` directory.
- **A test removes the temp files it makes**, in `afterEach`, `afterAll` or `onTestFinished`: the run fails at its end if anything is left in its temp dir (`tests/_support/run-temp-dir.ts`). A file test support makes on purpose is added to that module's list.
- **`src/exports/` is the public surface.** Everything else in `src/` is private; consumers import subpaths, never deep paths.
- **Code reached by `astromech/shared` or `astromech/fetch` must bundle for the browser.** `tests/exports/shared-browser.test.ts` fails on a Node builtin or a file outside its allowlist. Add a newly reached module to that allowlist, and import only what the browser can load from it.
- **If the build fails with `ERR_WORKER_OUT_OF_MEMORY`**, raise `NODE_OPTIONS=--max-old-space-size` (the DTS worker needs about 2 GB of heap) rather than trimming types.
