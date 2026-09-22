# Plugin factory extras & authoring scaffolding

**Status:** planned, not designed. Split out of
`roadmap/completed/plugin-authoring-experience.md` on 2026-07-29 when Phase 3
landed — these were its "still candidates" section, and none of them has a
design yet.

## Host-facing extras on the plugin factory

The one with a live consequence. `plugin.permissions(...)` proved the shape: a
plugin factory can carry helpers a **site** calls, with identity already
applied, so the site never writes a namespace and the plugin never imports its
own. Nothing generalises that to plugin-declared helpers.

The concrete case is seo. `seoSection()` is called from the site's config, so
there is no assembly moment and no `PluginContext` to read identity from.
`packages/plugins/seo/src/fields/groups.ts` derives its message namespace from
`SEO_PACKAGE` with `pluginNamespace`, the function the runtime uses, so no
first-party plugin writes a namespace by hand and a package rename cannot
desync it.

The design this section describes is still `seo.section()`: a plugin-declared
extra hung off the factory with identity applied, the way `permissions()`
already is. It is still undesigned: how a definition declares an extra, how the
extra receives resolved identity, and how it stays literal-typed through
`definePlugin<const Def>`.

Low urgency: until then, a host-facing helper imports its own package constant.

## `astromech plugin:new` scaffolding

There is `plugin:generate` and `plugin:purge`, but nothing to start a plugin
_from_ — today a new plugin begins by copying `packages/plugins/redirects/`.
Worth doing once the authoring surface stops moving, which after Phase 3 it
largely has.

Note that a scaffold locks in conventions, so it should not be written until
the `definePluginTable` question is settled — see the rejected `defineTable`
rename in the completed file, which stays rejected until `PluginDB` gains a
real consumer.

## Design, settled 2026-09-22

A plugin declares `helpers: Record<string, PluginHelper>`, where a helper is
`(plugin: ResolvedPluginIdentity, ...args) => unknown`. `definePlugin` builds
the no-options definition eagerly, resolves its identity, and hangs each helper
off the factory with the identity applied, so a site calls `seo.section()`
typed as `(options?: SeoSectionOptions) => Field`. A helper key that collides
with `permissions` or a function built-in throws. `permissions` reads
`identity.permissionNamespace`.

- [ ] Implement in `types/plugins.ts` and `plugins/define-plugin.ts`; move
      seo's `fields/groups.ts` to `helpers/section.ts`, delete `SEO_PACKAGE`
      and the `seoSection` export, and update the demo config, seed and seo
      README.
- [ ] Delete `pluginNamespace`/`PluginNamespace` from the `astromech` root.
- [ ] `DECISIONS.md`: the helpers entry (rejected: status quo imports, a
      Payload-style config transform, a second `definePlugin` argument, a
      curried helper factory, a Proxy) and a `definePluginTable` entry closing
      that question, since `AstromechPluginTables` is the consumer that settled
      it. `TERMINOLOGY.md`: "plugin helper".
- [ ] Move the `plugin:new` section to its own `planned/plugin-scaffolding.md`;
      it waits until the authoring surface stops moving.
- [ ] Per-plugin permission accessors (`forms.entryPermissions('form', …)`)
      stay out of scope.
