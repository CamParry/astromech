# Astromech documentation

Guides and reference for building with Astromech — configuring a project,
modelling content, and extending the CMS with plugins.

This is a living reference; it grows as the project does.

## Contents

- [content/entry-types.md](content/entry-types.md) — declaring entry types: the
  `entries` record, and `defineEntryType` for splitting a type into its own
  module.
- [data/migrations.md](data/migrations.md) — how migrations are generated from
  your table descriptors, what the generator refuses and why, and the
  hand-authored-ops escape hatch for reshapes it can't derive.
- [plugins/authoring.md](plugins/authoring.md) — write a plugin: the file-layout
  convention, identity, and every surface (custom fields, admin pages, admin
  slots, permissions, service methods, hooks, entry types, database tables, and i18n).
- [cli.md](cli.md) — the `astromech` CLI: entry CRUD + publish, JSON output, and
  method-manifest discovery.

## Learning from the bundled plugins

Astromech ships two plugins you can read as worked examples — install them, then
look at how they're put together:

- `astromech/plugins/redirects` — a plugin with its own database table, an entry
  type, a public service lookup method, and an optional hook.
- `astromech/plugins/seo` — a custom field, a field-section helper you compose
  into your entry types, admin pages (a dashboard and a settings form),
  localized strings, and footprint-derived behaviour.
