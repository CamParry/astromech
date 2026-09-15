# Config file location

A site can keep its config somewhere other than the project root, with
`astromech({ configFile: './cms/astromech.config.ts' })`. Two things do not
follow it:

- **The CLI does not read `astro.config.mjs`,** so every command needs the
  same path again with `--config` (`packages/astromech/src/transport/cli/config.ts`
  loads from `process.cwd()`).
- **The migrations folder is always `<working directory>/migrations`**
  (`packages/astromech/src/transport/cli/commands/db-generate.ts` and
  `packages/astromech/src/database/app-migrations.ts`), wherever the config is.

`apps/docs/installation.md` documents both as they are.

## Decided

On 2026-09-15, after comparing drizzle-kit, Prisma 7, Payload 3 and Astro:

- **The CLI keeps `--config`** as its only way to find a moved config, as
  drizzle-kit and Astro do. Reading `astro.config.mjs` would tie the CLI to
  Astro, and a `package.json` field is the design Prisma removed in 7.0.0.
- **The migrations folder becomes a config key, `migrationsDir`,** defaulting
  to `./migrations` and resolved against the working directory like every
  other relative path in the config. drizzle-kit (`out`), Prisma
  (`migrations.path`) and Payload (`migrationDir`) all have one. Resolving the
  folder next to the config file instead (Prisma 7's rule) would make it the
  one path that does not follow the working directory, and the built server
  does not know where the config file was.

Every caller reads the folder from the config: `db:init`, `db:generate`,
`db:rebaseline`, the Astro integration's migration hooks, and the built
server's pending-migrations check.

## The work

- [ ] Decide, recording the choice in `DECISIONS.md`.
- [ ] Add `migrationsDir` and read it everywhere the folder is resolved.
- [ ] Update `apps/docs/installation.md`, `apps/docs/cli.md`,
      `apps/docs/data/migrations.md`, `apps/docs/deployment/node.md` and
      `ARCHITECTURE.md` to match.
- [ ] A test that a config naming another folder generates, applies and checks
      migrations there.
