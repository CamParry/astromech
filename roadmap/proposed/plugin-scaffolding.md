---
milestone: 1.0
---

# `astromech plugin:init` scaffolding

There is `plugin:generate` and `plugin:purge`, but nothing to start a plugin
_from_: a new plugin begins by copying `packages/plugins/redirects/`.

A scaffold locks in conventions, so it waits until the authoring surface stops
moving. The `definePluginTable` question it was also waiting on is settled
(`DECISIONS.md`): a plugin with tables keeps its package name in a constant.

**Trigger:** build it after `planned/hooks.md`, `planned/permissions.md` and
`planned/notifications-channels-and-events.md` land. Each changes what a plugin
writes: the hook contract, the permission grammar and `defineRole`, and
declared notification types.

## Prior art

- **Strapi's `@strapi/sdk-plugin init`** asks questions, then writes into
  `src/plugins/` inside a project or a standalone package outside one.
- **Payload** keeps `templates/plugin` in its repo, with a `dev/` app and tests,
  and builds and tests it in CI.
- **Directus's `create-directus-extension`** has a template per extension type.
- **EmDash's `emdash-plugin init`** renders files from pure functions, refuses
  to overwrite without `--force`, and writes an `AGENTS.md` and a skill into
  the new plugin.
- **WP-CLI's `scaffold plugin`** is driven by flags and mustache templates.

None generates its template from documentation: each keeps it in the repo and
tests it.

## Decided (2026-10-03)

- **`astromech plugin:init`**, Strapi's word, beside `plugin:generate` and
  `plugin:purge`. Rejected: `plugin:new`, which no prior art uses.
- **A standalone package by default**; inside a pnpm workspace it writes a
  workspace package instead.
- **Questions, each with a flag**, so an agent or CI can run it without input.
  It refuses to overwrite without `--force`.
- **Minimal by default:** `definePlugin`, one service method, a test, a README
  and an `AGENTS.md` pointing at `apps/docs/plugins/authoring.md`. Tables (with
  migrations), admin pages and locales are opt-in flags.
- **Templates are pure render functions in the repo**, and CI scaffolds a plugin
  with every flag, runs its tests and installs it packed, as Payload does. The
  authoring guide links to the scaffold. Rejected: generating the scaffold from
  the guide, which nobody does and which leaves the output untested.

## The work

- [ ] The command and its questions and flags.
- [ ] The render functions: the minimal plugin, then each opt-in surface.
- [ ] A CI job (or a `check:install` step) that scaffolds with every flag,
      runs the plugin's tests and installs the packed tarball.
- [ ] The authoring guide's "Start a plugin" section points at the command.
