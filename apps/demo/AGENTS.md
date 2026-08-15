# apps/demo

The demo Astro site: the app to run and browser-verify against. Deployed, never published. Root `AGENTS.md` applies; this adds what is local to the demo.

- **This app is type-checked, and it is the only place the generated types are consumed as a site consumes them.** `typecheck` here runs `astro sync && tsc --noEmit`, and the root `typecheck` reaches it.
- **The demo loads the integration from `dist/`.** A change to core or the integration needs a root `pnpm run build` and a dev-server restart before it shows up. That applies in a worktree too: it has its own `dist/`, and an unbuilt one fails to resolve rather than silently serving main's code.
- **Browser-verify on port 4323**, signing in as `admin@astromech.dev` / `password`.
- **Ask before restarting the dev server; never restart it yourself.** The demo is kept open in a browser and a restart crashes that session. When a restart is needed, ask and wait for confirmation that it's back up.
- **This app owns the migrations.** `pnpm run db:generate` writes into `apps/demo/migrations/`; `pnpm run db:init` applies them. The CLI loads the full demo config, so every plugin must be built first.
- **`pnpm run check:config` loads this app's config the way Astro does**, catching a config-time import that reaches a domain service.
