# packages/plugins

The first-party plugins, each a separately published package consuming core only through its public surface. Root `AGENTS.md` applies; this adds what is local to plugins.

- **A plugin package may import `astromech`, `astromech/ui` and `astromech/ui/app`, and nothing else from core.** `astromech` and the `astromech/ui` component kit load under plain Node. `astromech/ui/app` — `useAstromechPlugin`, `CommandPalette`, the AI-context hooks, `ApiErrorPanel` — does not, so only a source-shipped `./admin/*` component may import it, never the plugin entry. Every other subpath reaches `virtual:astromech/config` and throws at import time. Type-only imports from any subpath are fine because they erase. Everything else arrives on `ctx`. `ARCHITECTURE.md` ("Plugin runtime boundary") has the mechanism.
- **A plugin's tests live in its own `tests/`**, run with `pnpm -F @astromech/<name> test:run`, and resolve core to source through `packages/astromech/tests/_support/plugin-vitest-config.ts`, so the plugin and its tests share one module graph. `@astromech/assistant` is the exception, resolving core through `dist`; its own `vitest.config.ts` says why.
- **These packages have no `lint` script**, so `pnpm run lint` skips them — but the pre-commit hook lints their files anyway. A plugin change can pass the gate and then fail on commit.
- **Tables live in `src/tables/`** and are published as a `./tables` subpath where a consumer needs them. `astromech plugin:generate` diffs them against the package's own migration snapshot.
- **Plugins own their migrations.** Generate into the plugin's own `migrations/`; the app merges the chains.
- **A new platform feature is added to `ctx`**, never as a published subpath a plugin is expected to import. The root `astromech` barrel is the sanctioned second route — a plugin may already import it, so a feature that is a pure function over a registry ships from there instead of growing `ctx` (`getModel`/`hasModel`).
