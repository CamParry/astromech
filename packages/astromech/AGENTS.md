# packages/astromech

The published `astromech` core.

- **Imports point down the layer model** (`ARCHITECTURE.md`, "The layer model"). Nothing enforces the direction (`DECISIONS.md`, "Nothing enforces the layer model"), so keep it by hand, and raise a wanted upward import as a design question rather than working around it.
- **Tests live in `tests/`, mirroring `src/`.** Mount the real router in a test when changing a route.
- **Test files share one module graph per worker.** A test that mocks a module, resets the module registry, stubs a global or writes `globalThis.__astromech` must be listed in `tests/_support/isolated-tests.ts`. `tests/isolation-list.test.ts` fails if it is not; add it there rather than chase why an unrelated test broke.
- **`src/exports/` is the public surface.** Everything else in `src/` is private; consumers import subpaths, never deep paths.
- **Code reached by `astromech/shared` or `astromech/fetch` must bundle for the browser.** `tests/exports/shared-browser.test.ts` fails on a Node builtin or a file outside its allowlist. Add a newly reached module to that allowlist, and import only what the browser can load from it.
- **`pnpm run build` can run out of memory in the DTS worker.** Raise `NODE_OPTIONS=--max-old-space-size` rather than trimming types.
