# 0031 — The plugin config view is an allow-list

**Date:** 2026-08-09
**Status:** accepted
**Supersedes:** 0030 in part (its reasoning for the `ai` strip)

`ctx.config` hands a plugin a `PluginConfigView`: an explicit `Pick` of fifteen
structural fields off `ResolvedConfig`, plus `entryTypesWithField`, constructed
field by field in `makeConfigView` rather than by spreading. `storage`, `email`
and `image` are not on it.

## What the spread cost once the config went live

`PluginConfigView` was `ResolvedConfig & { entryTypesWithField }`, built by
spreading the whole resolved config, so every field on `ResolvedConfig` reached
every plugin by default.

That was survivable only because `virtual:astromech/config` was a JSON literal.
A driver serialised through `JSON.stringify` arrives as a husk with no methods,
so `ctx.config.storage` was an object a plugin could read and could not call.
[0030](0030-the-server-loads-the-config-as-a-module.md) made the virtual module
the author's own module, and the husks became working objects. Measured with a
probe plugin before the fix: `ctx.config.storage.put` and
`ctx.config.email.driver.send` were both functions.

`ctx.storage` prefixes every key with `plugin/<alias>/` precisely so one plugin
cannot reach another's objects or the media library, and `ctx.config.storage.put`
walked straight past it. `ctx.sendEmail` was bypassable the same way. The JSON
boundary had been doing security work nobody designed it to do, and removing the
boundary took the work with it.

## Why an allow-list rather than more strips

`resolveConfig` already destructures `db`, `plugins`, `scheduler` and `ai` out of
the config it returns, and the cheaper fix was to add `storage`, `email` and
`image` to that list and write the rule down for whoever adds the next field.

Rejected, because it leaves the default wrong. `ResolvedConfig` grows: it is the
shape the admin, codegen and every domain service read, and fields land on it for
reasons that have nothing to do with plugins. Under a strip list the default for a
new field is "visible to every plugin", and the only barrier is whoever adds it
remembering a rule written in a comment. Under a `Pick` the default is
"invisible", and widening the view is a deliberate edit in two places, both in
files whose subject is the plugin boundary.

The four strips stay, as defence in depth rather than as the barrier. Each of the
four is reached through its own registry, which is reason enough to keep it off
`ResolvedConfig`, but none of them is now the thing standing between a plugin and
a live driver.

Nothing had to be widened to keep plugins working. Across all six first-party
plugins, the demo's external plugin and the tests, the only members any plugin
reads are `entries` and `entryTypesWithField`.

## Correcting 0030 on the `ai` strip

[0030](0030-the-server-loads-the-config-as-a-module.md) re-justified the `ai`
strip as the chokepoint forcing every consumer through `getAIConfig()` and the
logging middleware `buildAIConfig` wraps each model with. That is not true for
core. `boot/astro.ts` emits `export { rawConfig };` from
`virtual:astromech/config` alongside the default export, so any core SSR module
can read `rawConfig.ai.model` and hold the unwrapped instance; `src/middleware.ts`
already imports `rawConfig` for boot. The strip keeps `ai` off `ResolvedConfig`.
It does not put the config out of reach.

Where the strip does bind is plugins, which cannot import the virtual module at
all ([0007](0007-plugin-core-boundary.md)), and for them the projection is now
what enforces it: `ai` is not in the `Pick`, so `ctx.config.ai` does not exist
and `getModel` is the only route to a model.

0030 also misses a divergence in value, not only in wrapping. `getModel(name)`
falls back to the site's default model when `name` is not configured
(`packages/astromech/src/ai/index.ts`), while `config.ai.models[name]` would be
`undefined`, and `config.ai.models` is itself optional. A consumer reading the
config directly gets a different answer, not merely an unlogged one.

## What forecloses wrapping inside `resolveConfig`

The tidiest-sounding alternative is for `resolveConfig` to keep `ai` and put the
wrapped models on it, which would make the strip unnecessary. Module evaluation
order forecloses it. `buildAIConfig` is async, because it dynamically imports
`ai` so a site configuring no model never pulls the package into its graph, and
`virtual:astromech/config` calls `export default resolveConfig(rawConfig);` at
module top level. Making `resolveConfig` async turns that default export into a
`Promise<ResolvedConfig>`, which breaks every
`import config from 'virtual:astromech/config'` site in the package.
