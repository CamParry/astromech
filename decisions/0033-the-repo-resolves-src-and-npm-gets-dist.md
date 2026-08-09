# 0033 — The repo resolves `src`, npm gets `dist`

**Date:** 2026-08-09
**Status:** accepted

`packages/astromech/package.json` now carries two `exports` maps. The one in
`exports` points every subpath Vite loads at `./src/…`; `publishConfig.exports`
restores the full `./dist/…` map, and npm substitutes it at pack time.

The pattern is Payload 4's. In-repo consumers compile core through their own
bundler and the built artifact exists only for npm consumers, so `apps/demo` no
longer needs a root `npm run build` before a core edit shows up. The dev-server
restart is still needed: core source resolves through `node_modules/astromech`,
which Vite's watcher excludes, so an edit to a moved subpath is picked up on the
next boot rather than by HMR. Teaching the watcher about it would mean shipping a
monorepo-shaped `server.watch` override to every consumer of the integration,
which is a worse trade than restarting.

## Only half of core can take it

The config half cannot, and the reason is structural rather than incidental. The
Astro integration is loaded by **plain Node** at `astro:config:setup`, and so is
`astromech.config.ts` and everything it names — the drivers, `astromech/fields`,
the root barrel. Node has no `@/` alias and does not compile TypeScript, so
those subpaths must stay on built JS. `astromech/astro`, `.`, `./fields`,
`./columns`, the storage / database / media / email / scheduler drivers and
`./database/schema` are all in that set, and `npm run check:node-imports` still
spawns plain Node against `dist` to prove the plugin-facing ones load there.

The plugin packages are the same case one level out: `packages/plugins/*` are
evaluated at config time, so anything they import — `astromech` and
`astromech/ui` — is Node-loaded and unmoved. This is the boundary
[0007](0007-plugin-core-boundary.md) records, seen from the packaging side.

Two subpaths moved: **`astromech/local`** and **`astromech/middleware`**. Both
import `virtual:astromech/config`, which resolves in the Vite SSR graph and
nowhere else, so neither was ever loadable under Node — the strongest possible
evidence that Vite is their only loader. They join `astromech/routes/*.ts`,
`astromech/admin/shell.astro`, `astromech/media/Image` and `astromech/ui*`, which
already resolved to source.

## Why the two had to move together

Moving one subpath to `src` while a related one stays on `dist` gives the
process two copies of any module-level state both reach — the Vite-compiled copy
and the tsup-bundled one. `packages/astromech/src/utilities/registry.ts` already
exists for this: every boot-wired slot (`db`, `dbDriver`, `storage`, `image`,
`email`, `ai`, `scheduler`, `methodManifest`, the plugin runtime, entry access,
entry storage, the request context) lives on `globalThis`, so it is shared across
instances by construction and no split can touch it.

Two module-scope bindings in the shared graph are not:

- `PLUGIN_TABLES` in `packages/astromech/src/database/codec.ts`, written by
  `registerTableCodec` during `registerPlugins`.
- `PUBLIC_BRAND` in `packages/astromech/src/entries/visibility.ts`, the Symbol
  `markPublic` stamps and `isPublicBranded` checks before a create or update.

`astromech/middleware` is the only caller of `initRuntime`, so whichever copy of
it loads is the copy that owns both. Moving `astromech/local` alone would have
put the entries service behind `Astromech.entries` in the Vite-compiled copy
while boot kept wiring `ctx.entries` to the bundled one, and a row read in
`public` shape through one would carry a brand the other's write guard cannot
see — the guard fails open, which is the worst way for that check to break.
Moving both keeps boot, the injected API routes, the Local API and the admin in
one graph, which is also what
`packages/astromech/src/utilities/registry.ts`'s "two copies of the boot memo
would boot the runtime twice" note is guarding against.

## What was declined

- **`astromech/fetch`, `astromech/methods`, `astromech/cloudflare`** — nothing in
  `apps/demo`, `packages/plugins/*` or `scripts/` imports any of them, so there
  is no evidence they are Vite-loaded and no rebuild loop to remove. They stay on
  `dist`.
- **`astromech/database/schema` and `astromech/media/image/sharp`** — imported by
  `apps/demo/seed.ts`, which runs under `tsx`, not Vite.
- **`astromech/email`** — imported by `@astromech/forms` for the notification
  template, so it is Node-loaded with the rest of the plugin surface.

## `publishConfig.exports` is not a pure `dist` map

Five keys point at source in both maps, because there is no built output to point
at. `astromech/admin/shell.astro` and `astromech/media/Image` are Astro
components, which tsup does not compile; the three `astromech/routes/*.ts`
entrypoints are handed to `injectRoute` as specifiers and compiled by the
consumer's own Vite. `files` already ships `src`, so npm consumers get all five.

`astromech/ui`, `astromech/ui/fields` and `astromech/ui/layout` go the other way:
they resolve to source in the repo but to `dist` for npm. `boot/astro.ts` aliases
all three to `pkgSrc` inside Vite regardless, so the exports entry only decides
what a resolver outside that alias sees, and built JS is the better answer there.

The two maps drifting is the obvious failure mode — npm only reveals it after a
publish — so `npm run check:exports`
(`packages/astromech/scripts/check-exports-parity.mjs`) fails when the key sets
differ.

## What this does not fix

Anything reaching a Node-loaded subpath still resolves through the main
checkout's `dist` from inside a worktree, because `.claude/worktrees/*` resolve
`node_modules` there. The trap narrows; it does not close.
