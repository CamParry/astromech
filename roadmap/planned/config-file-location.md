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

## Options to weigh

- The CLI finds the config the way the integration does, for example by
  reading the path from `astro.config.mjs`, or from a `package.json` field.
- The migrations folder is a config key, or resolves next to the config file.
- Leave both, since most sites keep the config at the root.

## The work

- [ ] Decide, recording the choice in `DECISIONS.md`.
- [ ] Update `apps/docs/installation.md` and `apps/docs/cli.md` to match.
