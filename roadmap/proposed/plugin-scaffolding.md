# `astromech plugin:new` scaffolding

There is `plugin:generate` and `plugin:purge`, but nothing to start a plugin
_from_: a new plugin begins by copying `packages/plugins/redirects/`.

A scaffold locks in conventions, so it waits until the authoring surface stops
moving. The `definePluginTable` question it was also waiting on is settled
(`DECISIONS.md`): a plugin with tables keeps its package name in a constant.

- [ ] Design the command: what it asks, which surfaces it writes (tables,
      migrations, admin pages, locales), and whether it writes into a workspace
      or a standalone package.
- [ ] Generate from the conventions in `apps/docs/plugins/authoring.md`, so the
      guide and the scaffold cannot disagree.
