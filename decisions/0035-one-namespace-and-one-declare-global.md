# 0035 — One namespace, one `declare global`, and a keyed registry beside the single-value one

**Date:** 2026-08-09
**Status:** accepted

`ARCHITECTURE.md` claimed every driver slot shared one mechanism over a single
`globalThis.__astromech` namespace. Thirteen slots did. Ten other globals in
`packages/astromech/src` each declared their own top-level `globalThis.__astromechX`,
their own `declare global`, and their own lazy-init. Two of the comments named the
registries they were copying. The cost was never the duplicated lines: it was that
the invariant was false, and that the next author had two patterns to pick from with
nothing saying which.

All ten are now inside the namespace and `packages/astromech/src/utilities/registry.ts`
holds the only `declare global` in core.

## `createKeyedRegistry` is a second shape, not a generalisation

Two of the hand-rolls — per-type entry storage and per-name email overrides — are
keyed maps, and that is why they were written by hand: `createRegistry` models a
single-value slot, and folding a `Map` into it would have meant every existing
caller carrying a key it does not have.

`createKeyedRegistry<T>(name)` is the same slot with a `Map` in it:
`set(key, value)`, `get(key)` (throws), `peek(key)` (null), `has`, `keys`, `clear`.
It reuses `createRegistry`'s split between a throwing `get` and a probing `peek`, so
a reader who knows one knows the other. It takes no `hint`: the throw already names
both the slot and the missing key, which is as much as either caller could add.

Neither shape names its value types, for the reason the file has always given — a
registry that imports every domain's types turns a pure leaf into a hub.

## Two slots for entry storage, one slot for the plugin runtime

`entries/storage/registry.ts` held a record of `{ builtIn, overrides }`. Those split:
`entryStorageBuiltIn` is a lazily-constructed singleton, `entryStorageOverrides` is a
keyed map, and nothing ever writes both. Two slots.

`plugins/runtime/plugin-runtime.ts` held a record of seven fields and **stayed one
slot**, under `pluginRuntime`. `registerPlugins` rewrites five of them — config,
identities, hooks, service, rawRoutes — together in a single pass, and deliberately
leaves `client` and `methods` standing, because the Local API sets those at module
load to break an import cycle. Seven slots would spread one atomic write across five
`set` calls and make the "reset these five, keep those two" rule invisible: it would
only be readable by noticing which slots `registerPlugins` fails to mention. The file
says which it is and why, in a comment above the slot.

The alternative considered was splitting `client` and `methods` out and leaving the
five registration fields in one record, since those two genuinely are written
separately. It was declined for costing a second pattern to buy nothing: the record
is private to the module either way, and no caller can tell.

## The guards stayed direct property access

Five of the ten are not registries at all — a cron tick lock, a cron interval handle,
a warn-once set, the duplicate-admin-UI check, and the CLI's config stash. They share
the hazard that motivated the registry (a module-level singleton duplicates across
tsup entry chunks) without sharing its shape. Wrapping them in registry objects would
have said they are driver slots, which is the wrong thing to tell a reader about a
boolean that guards re-entry.

They are plain keys on the namespace, reached through an exported `globals()`. That
one accessor is the reason they are typed rather than cast: `AstromechGlobals` is
`Record<string, unknown>` — the index signature the registries need — intersected
with the five named keys. Their types are all built-ins (`boolean`, `string`,
`Set<string>`, `ReturnType<typeof setInterval>`), so naming them imports nothing and
the hub argument does not apply. The one exception is `cliConfig`, typed `unknown`
with a single cast in `transport/cli/virtual-config-shim.ts`, because naming
`ResolvedConfig` here is exactly the import the leaf must not have.

`cliConfig` is the borderline case: it is set once and read resolve-or-throw, which
is `createRegistry`'s exact shape. It stayed a plain key because the CLI shim is not
a capability slot — nothing boots it, and no driver lives behind it.

## The lint rule is the durable half

The namespace grew ten siblings with the invariant already written down, so the
convention does not hold on its own. `eslint.config.js` restricts
`TSModuleDeclaration[global=true]` under `packages/astromech/src/**`, with
`utilities/registry.ts` exempted by a `files` override.

No new dependency: `no-restricted-syntax` with an esquery selector is the mechanism
the `.js`-extension rules already use. `no-restricted-syntax` **replaces** rather than
merges across config blocks, so the four `.js` selectors are lifted into a shared
array and restated by every block that narrows the set — the alternative was silently
switching the extension check off for the files the new rule covers.

The rule is scoped to core's `src`, not the repo. `packages/plugins/backups` has its
own `declare global` for a run lock, and the pre-commit hook lints every staged file
regardless of workspace, so a repo-wide rule would have failed commits to a package
this namespace does not reach.

## What changed observably

One thing, deliberately. `entryAccess()` threw a bespoke sentence; it now throws
`createRegistry`'s standard `[Astromech] 'entryAccess' is not configured.` followed by
the same guidance as its `hint`. Nothing asserted on the old wording. Every exported
function name is unchanged — `getEntryStorage`, `setEntryStorage`,
`resetEntryStorageOverrides`, `registerEmailOverride`, `getEmailOverride`,
`registerEntryAccess`, `runWithContext` — because the registry is the implementation,
not the surface.

The test suite needed edits in exactly one category: five files poked at
`globalThis.__astromechCronInterval` and friends to reset state between cases, and now
poke at `globals().cronInterval`. Those are relocations of the same read and write,
not changed expectations.
