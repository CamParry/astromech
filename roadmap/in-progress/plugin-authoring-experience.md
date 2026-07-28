# Plugin authoring experience

Make a plugin declare itself the way an app declares its config: **one
`definePlugin` call holding identity and behaviour together**, with nothing
inside the package importing the package's own identity to build a namespaced
string.

The old surface split identity into a leaf `plugin.ts` that half the package
imported — not because identity is naturally separate, but to dodge a cycle:
sub-modules needed the namespace to build absolute strings (`asset()`,
`locales()`, `tKey()`, `definePermissionBundles(plugin.package, …)`), and
`index.ts` imported those sub-modules. Removing the _need_ removes the cycle,
and the identity object with it.

**Principle: sub-modules declare _relative_ facts; the framework absolutizes
them at assembly.** Core already did this in two places — `defineAdminPage`
takes a bare `permission: 'view'` and namespaces it, and computes a settings
`baseKey` from a bare `path`. This generalises that to every surface.

## Phase 1 — the define seam

- [x] `definePlugin(definitionOrFactory)` — one argument, identity inline,
      always returns a factory. `PluginDefinition` was already
      `PluginIdentity & {…}`, so one object is the type's natural shape
- [x] `PluginDefinition.root` (`import.meta.url`) + relative asset specifier
      resolution in `codegen/plugin-client-manifest.ts`; published packages omit
      `root` and resolve to `<package>/<path>`. Kills `asset()`
- [x] `i18n: ['en', 'fr']` shorthand → `./locales/<code>.json`. Kills `locales()`
- [x] `permissionBundles` on the definition, surfaced namespaced as
      `plugin.permissions(bundle)` with literal bundle-name typing;
      `definePermissionBundles` removed
- [x] `PluginContext.plugin` — a plugin's own resolved identity, so runtime code
      builds namespaced strings from context instead of an import
- [x] `definePluginTable` accepts a package string literal
- [x] Migrate all five plugins; delete every `plugin.ts`
- [x] `.tsx` under `src/admin/{fields,pages}/` — rating matches the convention
      seo and backups already used; deleted two dead duplicate components
- [x] Rewrite `apps/docs/plugins/authoring.md` for the new surface

## Known remainders (deliberate, not oversights)

- **Table-bearing plugins keep one `<X>_PACKAGE` string const** in a
  dependency-free leaf. `definePluginTable` needs the package as a _literal
  type_ to derive `PluginDB` keys, and a value inside `definePlugin` can't reach
  a module-scope descriptor. Fixable by having descriptors hold bare names,
  prefixing at assembly, and composing the literal via a **type-only** import of
  `typeof plugin` from `index.ts` (erased, so no runtime cycle) — deferred.
- **seo keeps `tKey`** for the same class of reason: `seoSection()` is called
  from the _site's_ config, so there is no assembly moment and no context to
  inject identity from. The general fix is to hang host-facing helpers off the
  factory (`seo.section()`, as `plugin.permissions()` already does), which needs
  `definePlugin` to carry plugin-declared extras.
- **SDK module augmentation stays hand-written.** `declare module 'astromech' {
interface AstromechPluginSdks { seo: … } }` needs the SDK key as a
  source-level literal; TS cannot compute an interface key from a value's type.

## Phase 2 — candidates, not yet designed

- Asset root: whether `root: import.meta.url` can be inferred rather than
  declared
- Host-facing extras on the factory, closing the two remainders above
- `astromech plugin:new` scaffolding (there is `plugin:generate` and
  `plugin:purge`, but nothing to start from — today a new plugin begins by
  copying `redirects/`)
- Effect hints (`mutates`/`destructive`) on first-party plugin SDK methods —
  the manifest currently defaults them to `mutates: true`, over-gating the
  future AI confirm gate (see `backlog.md`)
