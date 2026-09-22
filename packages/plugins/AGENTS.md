# packages/plugins

The first-party plugins, each a separately published package that reaches core only through its public surface.

- **A plugin imports only published `astromech` subpaths that load in plain Node**, such as `astromech`, `astromech/fields`, `astromech/columns`, `astromech/email` and `astromech/ui`. `pnpm run check:node-imports` imports every plugin entry in Node to prove it. `astromech/ui/app` does not load in Node, so only a source-shipped `./admin/*` component may import it. Type-only imports from any subpath are fine. Everything else arrives on `ctx` (`ARCHITECTURE.md`, "Plugin runtime boundary").
- **A new platform feature goes on `ctx`**, never on a new subpath a plugin must import. The root `astromech` entry is the other route: a pure function over a registry ships from there (`getModel`/`hasModel`).
- **A plugin's tests live in its own `tests/`**, run with `pnpm -F @astromech/<name> test:run`, and resolve core to source through `packages/astromech/tests/_support/plugin-vitest-config.ts`. `@astromech/assistant` resolves core through `dist` instead; its `vitest.config.ts` says why.
- **Each plugin has a `tsconfig.test.json` and a `lint` script**, which the root `typecheck` and `lint` run. `tsconfig.json` stays source-only, because tsup's declaration build reads it.
- **A package a plugin's admin component imports goes in `admin.optimizeDeps.include`** (except `astromech`, its subpaths and React), and must be a dependency or peer of the plugin. The plugin's own test fails on an import the list misses.
- **Tables live in `src/tables/`** and are published as a `./tables` subpath where a consumer needs them. `index.ts` adds them to `AstromechPluginTables`, so a site's `db` handle is typed with them; `apps/docs/plugins/authoring.md` has the block.
- **A plugin owns its migrations.** `astromech plugin:generate` diffs `src/tables/` against the plugin's own snapshot and writes into its `migrations/`; the app merges the chains.
