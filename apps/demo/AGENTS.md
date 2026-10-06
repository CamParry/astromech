# apps/demo

The demo Astro site on Node: the app to run and browser-verify against.

- **The demo loads the integration from `dist/`.** A change to core or the integration shows up only after a root `pnpm run build` and a dev-server restart. In a worktree an unbuilt `dist/` fails to resolve rather than serving main's code. A worktree's pre-start steps (`.config/wt.toml`) build it and seed its database.
- **Browser-verify on port 4323**, or in a worktree on the port `wt list` shows. Better Auth refuses a sign-in from any origin but `BETTER_AUTH_URL`, so a worktree's pre-start steps set it to that port in the worktree's copy of this app's env file.
- **The seed (`pnpm run db:seed:demo`) creates two users**, both with the password `password`:
    - `admin@astromech.dev`, an admin, who owns the seeded content.
    - `contributor@astromech.dev`, who can write entries but not publish them, for checking what a user without `publish` sees. The role is named after WordPress's Contributor, which has the same limit.
- **The seed clears the sign-in rate limit.** Better Auth allows 3 sign-in tries a minute and keeps the count in the database, so restarting the server does not reset it.
- **Ask before restarting the dev server; never restart it yourself.** The demo is kept open in a browser and a restart crashes that session. Ask, and wait for confirmation that it is back up.
- **This app owns the migrations.** `pnpm run db:generate` writes into `apps/demo/migrations/`; `pnpm run db:init` applies them. The CLI loads the full demo config, so build every plugin first.
- **This app's database is CI's relationships-index fixture** (the `index` job in `.github/workflows/ci.yml`). Check `pnpm -F astromech-demo index:rebuild --check` against a seeded database: on an empty one it passes without checking anything.
