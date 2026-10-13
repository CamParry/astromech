# apps/demo

The demo Astro site on Node: the app to run and browser-verify against.

- **The demo loads the integration from `dist/`.** A change to core or the integration shows up only after a root `pnpm run build` and a dev-server restart. A worktree's pre-start steps build it and seed its database.
- **Browser-verify on port 4323**, or in a worktree on the port `wt -C <worktree> step eval '{{ branch | hash_port }}'` prints, which is the one Better Auth accepts sign-ins from there. Start a second dev server with `pnpm -F astromech-demo dev --port <n>` (not `-- --port`, which astro ignores). `astro dev` detaches: stop it by the PID it prints.
- **The seed (`pnpm run db:seed:demo`) creates two users**, both with the password `password`, and clears the sign-in rate limit (3 tries a minute, kept in the database):
    - `admin@astromech.dev`, an admin, who owns the seeded content.
    - `contributor@astromech.dev`, who can write entries but not publish them.
- **Ask before restarting the dev server; never restart it yourself.** The demo is kept open in a browser and a restart crashes that session. Ask, and wait for confirmation that it is back up.
- **This app owns the migrations.** `pnpm run db:generate` writes into `apps/demo/migrations/`; `pnpm run db:init` applies them. The CLI loads the full demo config, so build every plugin first.
- **This app's database is CI's relationships-index fixture.** Check `pnpm -F astromech-demo index:rebuild --check` against a seeded database: on an empty one it passes without checking anything.
