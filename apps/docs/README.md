# Astromech documentation

Guides and reference for building with Astromech — configuring a project,
modelling content, and extending the CMS with plugins.

This is a living reference; it grows as the project does.

## Contents

- [configuration/database.md](configuration/database.md) — pick and configure a
  database driver (`libsql`, `d1`), what D1's lack of transactions means
  for your data, and the contract for writing your own.
- [configuration/storage.md](configuration/storage.md) — pick and configure a
  storage driver (`filesystem`, `r2`, `s3`), media access modes and public URLs,
  signed URLs and the R2 signing trap, and the contract for writing your own.
- [configuration/ai.md](configuration/ai.md) — configure model access: the `ai`
  block, installing a provider package, `model` versus named `models`, reaching
  a model from your own code with `getModel`, and what the assistant plugin
  needs.
- [configuration/scheduler.md](configuration/scheduler.md) — scheduled jobs:
  how a frequent tick and database-stored cadence fit together, the three
  scheduler drivers (`interval`, `cloudflareCron`, `webhook`), and wiring a
  Cloudflare Worker's `scheduled()` handler.
- [configuration/trust-proxy.md](configuration/trust-proxy.md) — where the
  connecting address of a request comes from, the `security.trustProxy` option
  for a site behind a proxy, and why the address is counted from the right of
  `x-forwarded-for`.
- [content/entry-types.md](content/entry-types.md) — declaring entry types: the
  `entries` record, and `defineEntryType` for splitting a type into its own
  module.
- [content/relationships.md](content/relationships.md) — linking content to
  content: declaring a relation, why the value is ids rather than expanded
  records, querying the reverse direction with `where: { references }`, and
  keeping the derived index in sync with `index:rebuild`.
- [content/rich-text.md](content/rich-text.md) — the `richtext` field and its
  `allow` list, why the stored value is ProseMirror JSON while a public read is
  HTML, and the two conversions: `renderRichText` and `parseRichText`.
- [content/field-validation.md](content/field-validation.md) — declaring rules
  on fields, why `required` only fires at publish while correctness checks run on
  every write, custom validators, and what does and does not run in the browser.
- [ai-context.md](ai-context.md) — how an admin route declares what the user is
  looking at so a model can resolve "this page", the reference shape, and why it
  is sent as a `role: 'system'` message rather than in the system prompt.
- [data/migrations.md](data/migrations.md) — how migrations are generated from
  your tables, what the generator refuses and why, and the
  hand-authored-ops escape hatch for reshapes it can't derive.
- [plugins/forms.md](plugins/forms.md) — the options `forms()` takes: spam
  provider, stored request metadata, and the submission rate limit — what it
  keys on, who it does not limit, and what a refused submission returns.
- [plugins/authoring.md](plugins/authoring.md) — write a plugin: the file-layout
  convention, identity, and every surface (custom fields, admin pages, admin
  slots, permissions, service methods, hooks, entry types, database tables, and i18n).
- [cli.md](cli.md) — the `astromech` CLI: entry CRUD + publish, JSON output,
  method-manifest discovery, rebuilding the relationships index, and reporting
  stored rows that fail the current validation.

## Learning from the bundled plugins

Astromech ships six plugins you can read as worked examples — install them,
then look at how they're put together:

- `@astromech/redirects` — a plugin with its own database table, an entry
  type, a public service lookup method, and an optional hook.
- `@astromech/forms` — two entry types (one core-stored, one table-backed),
  public service methods an anonymous caller reaches, gating hooks, and two
  provider seams (notification kinds and spam services) a site can extend.
- `@astromech/seo` — a custom field, a field-section helper you compose
  into your entry types, admin pages (a dashboard and a settings form),
  localized strings, and footprint-derived behaviour.
- `@astromech/menus` — options-driven admin pages generated per configured
  menu, and a public service method that resolves entry refs to URLs.
- `@astromech/backups` — a database table, a cron job, plugin storage, and raw
  HTTP routes for the streaming endpoints.
- `@astromech/assistant` — the AI assistant: the first plugin to contribute
  admin slots (a topbar button and the chat drawer), a raw route streaming
  server-sent events, and `ctx.methods.tools()` for the model-callable surface
  the caller's role reaches.

The demo app also carries `apps/demo/src/plugins/rating`, a deliberately small
teaching plugin that shows the same conventions for an **in-tree** plugin (one
that declares `root: import.meta.url` instead of resolving assets against a
package specifier).
