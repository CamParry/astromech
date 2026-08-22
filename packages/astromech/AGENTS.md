# packages/astromech

The published `astromech` core. Root `AGENTS.md` applies; this adds what is local to core.

- **Imports point down the layer model by convention.** entrypoints → transport → policies → the content modules (`entries`, `media`, `users`, `settings`, `notifications`) → the modules they build on (`database`, `storage`, `fields`, `config`, …) → leaves; `ARCHITECTURE.md` ("The layer model") is the map. No scanner enforces the direction (`decisions/0070-drop-dependency-cruiser.md`) — keep it anyway, and treat a wanted upward import as a design question to raise, not a rule to satisfy.
- **Tests live in `tests/`, mirroring `src/`.** A service test calls the Local API and never touches `transport/http/routes/*`, so a route that drops a field passes the whole suite. Mount the real router in a test when changing a route.
- **`exports/` is the public surface.** tsup builds from there; everything else in `src/` is private. Consumers use subpaths, never deep imports.
- **Module barrels re-export the server service**, which reaches `virtual:astromech/config`. Admin and browser code must deep-import the pure leaf, not the barrel. A module file the browser needs takes the `*.shared.ts` suffix, which limits what it may import in turn.
- **Module-level singletons duplicate across tsup entry chunks.** Use the `globalThis.__astromech*` registry pattern instead.
- **`pnpm run build` can OOM in the DTS worker.** Raise `NODE_OPTIONS=--max-old-space-size` rather than trimming types.
