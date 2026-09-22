# apps/demo

The demo Astro site on Node: the app to run and browser-verify against.

- **The demo loads the integration from `dist/`.** A change to core or the integration shows up only after a root `pnpm run build` and a dev-server restart. In a worktree an unbuilt `dist/` fails to resolve rather than serving main's code.
- **Browser-verify on port 4323**, signing in as `admin@astromech.dev` / `password`.
- **Ask before restarting the dev server; never restart it yourself.** The demo is kept open in a browser and a restart crashes that session. Ask, and wait for confirmation that it is back up.
- **This app owns the migrations.** `pnpm run db:generate` writes into `apps/demo/migrations/`; `pnpm run db:init` applies them. The CLI loads the full demo config, so build every plugin first.
- **This app's database is CI's relationships-index fixture** (the `index` job in `.github/workflows/ci.yml`). Check `pnpm -F astromech-demo index:rebuild --check` against a seeded database: on an empty one it passes without checking anything.
