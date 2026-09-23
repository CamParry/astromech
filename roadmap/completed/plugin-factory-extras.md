# Plugin helpers

`plugin.permissions(...)` proved the shape: a plugin factory can carry
functions a **site** calls in its config, with the plugin's identity already
applied, so the site never writes a namespace and the plugin never imports its
own. Plugin helpers generalise that to functions a plugin declares.

The case that needed it was seo. Its field section is built in the site's
config, where there is no `PluginContext` to read identity from, so the plugin
kept its package name in `SEO_PACKAGE` and derived its message namespace with
`pluginNamespace`, a function the `astromech` root exported for that one use.

## Design

A plugin declares `helpers: Record<string, PluginHelper>`, where a helper is
`(plugin: ResolvedPluginIdentity, ...args) => unknown`. `definePlugin` builds
the no-options definition eagerly, resolves its identity, and hangs each helper
off the factory with the identity applied, so a site calls `seo.section()`
typed as `(options?: SeoSectionOptions) => Field`. A helper key the factory
already has (`permissions`, or a function built-in such as `name` or `call`)
throws. `permissions` reads `identity.permissionNamespace`.

## Where a plugin's identity is still written by hand

- **`<X>_PACKAGE` constants in assistant, backups, forms and redirects** stay:
  `definePluginTable` needs the package as a literal at module scope, before
  any definition exists. `DECISIONS.md` records why.
- **`plugin:generate` and `plugin:purge`** derive the namespace from
  `package.json` with core's internal function, since neither loads a config.
- **Qualified ids a site writes** (`entryPermissions('redirects/redirect', …)`,
  `globalPermissions('seo/settings', …)`) stay: the id is the type's address.
  Per-plugin permission accessors (`forms.entryPermissions('form', …)`) were
  out of scope.

## The work

- [x] `PluginHelper` and `PluginDefinition.helpers` in `types/plugins.ts`;
      `plugins/define-plugin.ts` binds them and builds the no-options
      definition once. **Public API**: `PluginFactory` carries the helpers.
- [x] seo's section moved to `packages/plugins/seo/src/helpers/section.ts` as
      `seo.section()`; `SEO_PACKAGE` and the `seoSection` export deleted; demo
      config, seed and seo README updated. **Public API**.
- [x] `pluginNamespace`/`PluginNamespace` deleted from the `astromech` root.
      **Public API**.
- [x] `DECISIONS.md`: the helpers entry and the `definePluginTable` entry.
      `TERMINOLOGY.md`: "Plugin helper".
- [x] The `plugin:new` section moved to `roadmap/planned/plugin-scaffolding.md`.
