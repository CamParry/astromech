# Plugin tables on a site's database handle

A site that wants to query a plugin's table through the shared Kysely handle has
to name that plugin's table module itself:

```ts
const pluginDb = db.withTables<PluginDB<{ redirects: typeof redirectsTable }>>();
await pluginDb.deleteFrom('pluginRedirectsRedirects').execute();
```

`apps/demo/seed.ts` does exactly this. It works, but the site is restating
something the config already knows — the plugin is installed, so its tables are
already part of the schema that `db:generate` migrates.

`DB` in `packages/astromech/src/database/types.ts` is a `type` alias and is not
on the public export surface, so there is nothing for a plugin to augment and
nothing a site could name if there were. `PluginDB<T>` builds a fresh Kysely
interface from a plugin's `Table` objects rather than extending the core one;
`define-plugin-table.ts` documents the call-site cast as the intended use.

## Change

- [ ] Have the type generator emit the installed plugins' table types into
      `.astro/`, the same place the entry field types already land.
- [ ] Put an augmentable interface on `astromech`'s public surface for them to
      land on, so `db` on a site is typed with core's tables plus the installed
      plugins' without the site naming either.
- [ ] `encodeWith` returns `Record<string, unknown>` rather than its table's
      insert shape, so `seed.ts` still casts the rows it hands to `.values()`.
      Give it the table's insert type and the cast goes away.

## Notes / caveats

- The first two are one change: the emitted declarations are useless without a
  target to merge into, and the target is empty without the emission.
- The third is independent and smaller, and is worth doing first — it is a
  signature change on one function, and it removes a cast that currently hides
  whatever else may be wrong about the rows.
- Both halves came out of `roadmap/completed/demo-typecheck.md`, which is where
  the demo first exercised this path as a site does.
