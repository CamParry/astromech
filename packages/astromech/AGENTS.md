# packages/astromech

The published `astromech` core. Root `AGENTS.md` applies; this adds what is local to core.

- **The import graph is a DAG and it is enforced.** Imports point down only: entrypoints → transport → policies → domains → capabilities → leaves; peers inside a layer may read each other. `ARCHITECTURE.md` has the layer model; `npm run lint:deps` fails the build on a violation. The rules generate from the `LAYERS` table at the top of `packages/astromech/.dependency-cruiser.cjs`, so a new top-level `src/` directory has to be added there before the scan will pass.
- **Tests live in `tests/`, mirroring `src/`.** A service test calls the Local API and never touches `transport/http/routes/*`, so a route that drops a field passes the whole suite. Mount the real router in a test when changing a route.
- **`exports/` is the public surface.** tsup builds from there; everything else in `src/` is private. Consumers use subpaths, never deep imports.
- **Domain barrels re-export the server service**, which reaches `virtual:astromech/config`. Admin and browser code must deep-import the pure leaf, not the barrel. A domain file the browser needs takes the `*.shared.ts` suffix, which limits what it may import in turn.
- **Module-level singletons duplicate across tsup entry chunks.** Use the `globalThis.__astromech*` registry pattern instead.
- **`npm run build` can OOM in the DTS worker.** Raise `NODE_OPTIONS=--max-old-space-size` rather than trimming types.
