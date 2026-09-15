# Plugin tables on a site's database handle

A site that queried a plugin's table through the shared Kysely handle had to
name that plugin's table module itself, through
`db.withTables<PluginDB<...>>()`, restating what the config already knew.

## Outcome

Each plugin package extends `AstromechPluginTables` on `astromech` with
`PluginDB` in a `declare module` block in its own source, and `DB` extends that
interface. So `db` on a site carries every plugin's tables, and
`apps/demo/seed.ts` queries `pluginRedirectsRedirects` on `db` directly.
`PluginDB` takes the same `as const` array a plugin passes to its definition, so
a plugin lists its tables once. `DECISIONS.md` records why the plugin does the
typing rather than generated declarations.

## Change

- [x] Type the installed plugins' tables on a site's handle. Done by each plugin
      package's own augmentation rather than by the type generator: a plugin's
      tables are fixed by its package, so generating them from the site's config
      had nothing to add.
- [x] Put an augmentable interface on `astromech`'s public surface for them to
      land on: `AstromechPluginTables`, exported from `astromech`.
- The `encodeWith` return-type item moved to
  `roadmap/completed/small-roadmap-defects.md`; it was independent of the two
  above.
