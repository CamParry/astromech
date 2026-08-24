# packages/astromech

The published `astromech` core. Root `AGENTS.md` applies; this adds what is local to core.

- **Imports point down the layer model by convention.** entrypoints → transport → policies → the content modules (`entries`, `media`, `users`, `settings`, `notifications`) → the modules they build on (`database`, `storage`, `fields`, `config`, …) → leaves; `ARCHITECTURE.md` ("The layer model") is the map. No scanner enforces the direction (`decisions/0070-drop-dependency-cruiser.md`) — keep it anyway, and treat a wanted upward import as a design question to raise, not a rule to satisfy.
- **Tests live in `tests/`, mirroring `src/`.** A service test calls the Local API and never touches `transport/http/routes/*`, so a route that drops a field passes the whole suite. Mount the real router in a test when changing a route.
- **Test files share one module graph per worker** (`decisions/0094-core-tests-share-a-module-graph.md`). A test that mocks a module, stubs a global or writes `globalThis.__astromech` has to be listed in `tests/_support/isolated-tests.ts`; `tests/isolation-list.test.ts` fails if it is not, so add it there rather than working out why an unrelated test broke.
- **`exports/` is the public surface.** tsup builds from there; everything else in `src/` is private. Consumers use subpaths, never deep imports.
- **There are no internal barrels.** Every import names the file that declares the symbol; only `src/exports/` re-exports, and only for a published subpath (`decisions/0093-barrels-are-entry-points-not-navigation.md`). A lint rule rejects an import of a path ending in `index`, bar the modules that hold real code. `src/types/index.ts` is the exception, type-only and erased. Browser code deep-imports a pure leaf; a module file the browser needs takes the `*.shared.ts` suffix, which limits what it may import in turn.
- **Module-level singletons duplicate across tsup entry chunks.** Use the `globalThis.__astromech*` registry pattern instead.
- **`pnpm run build` can OOM in the DTS worker.** Raise `NODE_OPTIONS=--max-old-space-size` rather than trimming types.
