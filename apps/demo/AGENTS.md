# apps/demo

The demo Astro site: the app to run and browser-verify against. Deployed, never published. Root `AGENTS.md` applies; this adds what is local to the demo.

- **Nothing type-checks this app.** There is no `typecheck` script here and the root one does not reach it.
- **The demo loads the integration from `dist/`.** A change to core or the integration needs a root `npm run build` and a dev-server restart before it shows up. A worktree resolves `dist/` to the main checkout, so a worktree demo runs main's code, not the branch's.
- **Browser-verify on port 4323**, signing in as `admin@astromech.dev` / `password`.
- **Ask before restarting the dev server; never restart it yourself.** The demo is kept open in a browser and a restart crashes that session. When a restart is needed, ask and wait for confirmation that it's back up.
- **This app owns the migrations.** `npm run db:generate` writes into `apps/demo/migrations/`; `npm run db:init` applies them. The CLI loads the full demo config, so every plugin must be built first.
- **`npm run check:config` loads this app's config the way Astro does**, catching a config-time import that reaches a domain service.
