---
milestone: 1.0
---

# CLI commands

The CLI covers the database, users and entries, and little else. Raised on
2026-10-04; decided 2026-10-05.

Separate files: `roadmap/planned/search-replace.md`,
`roadmap/planned/export-and-import.md`, `roadmap/planned/create-astromech.md`
and `roadmap/planned/field-rename-command.md`.

## What exists

- 25 citty commands in `packages/astromech/src/transport/cli/commands/`:
  `db:init|status|generate|rebaseline`, `users:create|list|get|delete`,
  `entries:list|get|create|update|publish|unpublish|delete`,
  `generate:types|manifest`, `index:rebuild`, `validate`,
  `plugin:generate|purge`, `methods`, `call`, `permissions` and `mcp`.
- Each command is hand-written against citty's `defineCommand`, with shared
  flags in `common-args.ts` and printing in `output.ts`. There are no globals,
  media or cron commands, and a plugin cannot add a command.
- `call` reaches any service method as a trusted caller, with no permission
  checks.
- Output is `--json` on some commands and differently shaped text on others.

## Prior art

- **WP-CLI:** `wp post list`; `--format table|json|csv|yaml|ids|count` and
  `--fields` on every list; `--yes` skips confirmation; `--user` runs as a
  user; `search-replace` and `media regenerate`; `wp db` for direct access.
  Packages add commands with `WP_CLI::add_command`.
- **Laravel Artisan:** `noun:verb` (`make:model`, `model:prune`), commands
  defined as classes and registered by packages.
- **citty** (and Nuxt's CLI on it) names a command `defineCommand`.
- **Pruning:** `git prune`, `docker system prune` (lists what it removes, then
  asks), `npm prune` and Laravel's `model:prune`.

## Decided (2026-10-05)

- **Commands are named after their service:** `noun:verb` with the service's
  key, so `entries:query` matches `call entries.query`. Today's `entries:*` and
  `users:*` keep their nouns; `globals:`, `media:` and `notifications:` join
  them. No aliases.
- **`defineCommand({ key, description, args, run })`** registers every command,
  in core and in plugins. `run` receives the parsed args, the services (scoped
  when `--as` or an API key is in use), `output()` honouring `--format` and
  `--fields`, and `confirm()` honouring `--yes` and the no-terminal rule: the
  same handle a plugin method gets. Plugins pass
  `definePlugin({ commands: [...] })`, named `<namespace>:<key>`. citty stays
  underneath, and plugins never import it. The name is citty's own.
- **A command per service method,** generated from the manifest: flags from
  the input schema, the command named after the method (`entries:query`,
  `users:get`), nested input as `--data '{…}'` or `--data @file.json`. Plugin
  methods appear under their service key. Hand-written where the shape
  differs: `users:create` (a password prompt) and `media:import` (files).
  `call` and `methods` stay for anything else. Rejected: mapping `query` to
  `list` as WP-CLI names it, which needs a lookup table between the CLI and
  every other transport.
- **Shared flags:**
    - `--format table|json|csv|yaml|ids|count`, `--json` short for
      `--format json`, and `--fields a,b`.
    - `--yes` skips confirmation; `--force` only ever means overwrite;
      `--apply` runs a bulk write that otherwise reports what it would change.
    - `--as <user>` runs with that user's permissions through the scoped
      services. Without it, commands keep today's trusted access.
    - `--locale` and `--quiet`.
    - With no terminal attached, nothing prompts: a command needing
      confirmation fails unless given `--yes`.
- **`db:init` becomes `db:migrate`.**
- **Reaching a site.** Permissions come from the API key or `--as`, never from
  which command it is.
    - Without `--url`, every command runs against the database the config
      points at: a local file, a remote libSQL URL, or production D1 with
      `--remote`.
    - With `--url` (or `ASTROMECH_URL`) and `ASTROMECH_API_KEY`, every command
      built from a service method runs over HTTP
      (`roadmap/planned/api-keys.md`). This reaches a site whose database lives
      only on its server.
    - `db:*`, `export`/`import`, `search-replace` and `fields:*` run directly
      only: one Worker request is capped at 30 seconds of CPU by default and
      128MB of memory, and a site with broken migrations cannot migrate itself
      over HTTP.
    - A direct write cannot reach the live page cache. With `ASTROMECH_URL`
      set the CLI calls the site's clear; otherwise it prints a warning.
- **Media:** `media:import <files or URLs>`, and
  `media:regenerate --only-missing`, which rebuilds stored metadata
  (dimensions, the blurhash, the transparency flag from
  `roadmap/completed/image-optimisation.md`).
- **Smaller commands:** `cron:list`, `cron:run <key>`, `users:reset-password`,
  `users:login-link` (a one-time sign-in link), and `run <script.ts>` with the
  site's services loaded, which replaces seed scripts. `cache:clear` comes
  with `roadmap/planned/page-caching.md`.
- **`doctor`** runs the site-health checks (`roadmap/planned/site-health.md`)
  in the terminal and exits non-zero on a critical one.
- **`prune` replaces `plugin:purge`.** It scans, lists what it found by group
  with a count and the action, and lets you tick groups to run in a terminal;
  with no terminal it only reports, unless given `--apply --only <groups>`.
  `doctor` reports and `prune` fixes; a health check can point at it.
  Rejected: `purge`, and `cleanup`, which no prior art uses for this. Groups,
  each shipped only where the thing exists by 1.0:
    - tables and settings left by removed plugins;
    - cron rows with no job;
    - media rows with no file, and files with no row;
    - stored image variants nothing uses;
    - expired sessions, reset tokens and API keys;
    - relationship and search-index rows pointing at deleted entries;
    - trash older than a set age.

## After 1.0

`definePrune` for plugin groups, `shell` (an interactive prompt),
`routes:list`, `about`, aliases, a WordPress (WXR) import plugin, and
`astromech build` (`roadmap/proposed/multi-runtime-and-framework-integrations.md`).

## The work

- [ ] Defects first:
    - `plugin:purge` drops tables without asking (until `prune` replaces it).
    - `users:create` prints the password back and prompts with no terminal.
    - Some commands have no `--json`.
    - `entries-list.ts` turns a bad `--limit` into `NaN`.
    - `roadmap/completed/cli.md` lists a `seed` command that does not exist.
    - The D1 platform proxy is never disposed, so `db:init` hangs
      (`roadmap/in-progress/operations-defects.md`, "Left open").
- [ ] `defineCommand`, `output()` and `confirm()`; move every core command to
      it; `definePlugin({ commands })`.
- [ ] The shared flags, `--as`, and the no-terminal rule.
- [ ] Commands generated from the manifest, replacing the hand-written
      `entries:*` and `users:*` where the generated ones match.
- [ ] `db:migrate`.
- [ ] `--url` over HTTP with an API key; the cache clear after a direct write.
- [ ] `media:import` and `media:regenerate`.
- [ ] `cron:list`, `cron:run`, `users:reset-password`, `users:login-link`,
      `run`.
- [ ] `doctor`.
- [ ] `prune` and its groups; `plugin:purge` removed.
- [ ] `apps/docs/cli.md`.

## Testing

A generated command takes its flags from the method's schema and refuses bad
input with the schema's message; every list command prints each `--format`;
`--as` an editor is refused an admin-only method; with no terminal a command
needing confirmation fails without `--yes`; a plugin command runs under its
namespace; `--url` sends the API key and is refused for a direct-only command;
`prune` with no terminal and no `--apply` changes nothing; `doctor` exits
non-zero on a critical check.
