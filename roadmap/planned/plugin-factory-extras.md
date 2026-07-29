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

The concrete victim is seo. `seoSection()` is called from the site's config, so
there is no assembly moment and no `PluginContext` to read identity from —
`packages/plugins/seo/src/fields/groups.ts` therefore hardcodes
`const NAMESPACE = 'seo'`. That is the last hand-written namespace literal in
any first-party plugin, and it is a stand-in that has now survived three
phases.

The fix is `seo.section()` — a plugin-declared extra hung off the factory, the
way `permissions()` already is. What is undesigned is the mechanism: how a
definition declares an extra, how the extra receives resolved identity, and how
it stays literal-typed through `definePlugin<const Def>`.

Low urgency: seo has no tables, so nothing derives an identifier from that
literal. A rename of the seo package would silently desync it, which is the
only real failure mode.

## Asset root inference

`root: import.meta.url` is declared by hand on every in-tree plugin. Published
packages omit it and relative specifiers resolve to `<package>/<path>` instead.
Open question: whether the in-tree case can be inferred rather than declared.
Phase 1 established the two resolution modes; this is only about deleting the
one line.

## `astromech plugin:new` scaffolding

There is `plugin:generate` and `plugin:purge`, but nothing to start a plugin
_from_ — today a new plugin begins by copying `packages/plugins/redirects/`.
Worth doing once the authoring surface stops moving, which after Phase 3 it
largely has.

Note that a scaffold locks in conventions, so it should not be written until
the `definePluginTable` question is settled — see the rejected `defineTable`
rename in the completed file, which stays rejected until `PluginDB` gains a
real consumer.
