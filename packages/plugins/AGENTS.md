# packages/plugins

The first-party plugins, each a separately published package consuming core only through its public surface. Root `AGENTS.md` applies; this adds what is local to plugins.

- **A plugin package may import `astromech` and `astromech/ui`, and nothing else from core.** Both load under plain Node; every other subpath reaches `virtual:astromech/config` and throws at import time. Type-only imports from any subpath are fine because they erase. Everything else arrives on `ctx`. `ARCHITECTURE.md` ("Plugin runtime boundary") has the mechanism.
- **These packages have no `lint` script**, so `npm run lint` skips them — but the pre-commit hook lints their files anyway. A plugin change can pass the gate and then fail on commit.
- **Table descriptors live in `src/tables/`** and are published as a `./tables` subpath where a consumer needs them. `astromech plugin:generate` diffs them against the package's own migration snapshot.
- **Plugins own their migrations.** Generate into the plugin's own `migrations/`; the app merges the chains.
- **New platform capabilities are added as a port on `ctx`**, never as a published subpath a plugin is expected to import.
