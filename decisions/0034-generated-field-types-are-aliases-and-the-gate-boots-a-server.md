# 0034 — Generated field types are aliases, and the gate boots a server

**Date:** 2026-08-09
**Status:** accepted

Two changes that arrived together because the same missing check hid both:
nothing in the gate ever type-checked `apps/demo`, and nothing ever ran the
built server. `apps/demo` is now in `npm run typecheck`, and `npm run check:boot`
builds and boots it.

## The generator emits `type`, not `interface`

`codegen/type-generator.ts` wrote `export interface PostFieldsPublic { … }`. A
TypeScript **interface** never receives an implicit index signature; an alias of
an object type does. `Entry['fields']` is `JsonObject`, so
`TypedEntry<PostFieldsPublic>` could not be passed anywhere an `Entry` was
expected — nine of the demo's seventeen errors, in one file of ordinary query
wrappers. Every site would hit it on its first typed read.

Emitting `export type PostFieldsPublic = { … }` is the fix. Adding
`[k: string]: unknown` by hand was rejected: it reopens the type to any key, so a
typo in a field name stops being an error.

The repo's own `eslint.config.js` already sets
`@typescript-eslint/consistent-type-definitions: ['error', 'type']`. The
generator was emitting a construct no hand-written file in this repo is allowed
to contain, and no lint rule reaches generated output to say so.

The same change applies to the full `Fields` types and to the hoisted tree node
declarations, which are reachable from `Fields` and so have to be JSON-shaped
too. The `declare module 'astromech'` blocks keep their `interface` — declaration
merging is the entire point there.

### The blocks element type had to change with it

`blocks` emitted
`Array<{ _id: string; … [key: string]: JsonValue | undefined }>`, and
`JsonValue | undefined` is not `JsonValue`, so the alias still failed. The
`| undefined` cannot simply be dropped: the full shape carries `_disabled?` and
`_title?`, and an optional property is not assignable to a `JsonValue` index
signature. Intersecting instead — `Array<JsonObject & { _id: string; … }>` —
is well-formed in both shapes, keeps the known keys precisely typed, and makes
the element a `JsonObject` by construction.

## `AstromechClient.plugins` is not optional

It was `plugins?: PluginServiceNamespace`, and both transports assign it
unconditionally. The optional marker only ever forced callers to guard a property
that cannot be absent, and the demo demonstrated the cost: `Site.astro` wrote
`Astromech.plugins?.menus`, `middleware.ts` wrote `Astromech.plugins.redirects`,
and only one of them type-checked. Lookups inside the namespace are already lazy
and already resolve to `undefined` for an uninstalled plugin, so the honest
signal lives a level down.

`ServiceInterface` changed with it: a method declared with an `undefined` input
now maps to `(input?: I) => …`. The redirects and seo services already documented
`.sitemap()` as a bare call and the mapped type made it a type error.

## A site cannot reach a plugin's tables through `DB` — by construction

The demo's `seed.ts` failed on `db.deleteFrom('plugin_redirects_redirects')`. The
diagnosis in `roadmap/planned/demo-typecheck.md` — that a `PluginDB` augmentation
was not reaching the site's `tsconfig` — is wrong, and worth recording because it
is the plausible reading:

- `DB` in `database/types.ts` is a **`type` alias**, not an interface, so it
  cannot be augmented at all.
- It is not on `astromech`'s public export surface, so a site could not name it
  even if it were.
- `PluginDB<T>` is not an augmentation. It builds a fresh Kysely interface from a
  plugin's own `Table` objects, and `define-plugin-table.ts` documents the use as
  an explicit cast at the call site: `getDb() as unknown as Kysely<PluginDB<…>>`.

So the mechanism exists and works; the demo simply was not using it, and was
passing the SQL table name where the `CamelCasePlugin` key belongs. `seed.ts`
widens its handle once with `db.withTables<PluginDB<…>>()` and queries
`pluginRedirectsRedirects`. `withTables` is Kysely's own API for this and beats
the `as unknown as Kysely<…>` cast the `definePluginTable` docblock shows: no
assertion, and no import of `kysely` into a package that does not declare it.

Two things are left open. `encodeWith` returns `Record<string, unknown>` rather
than its table's insert shape, so the `as never` on the seeded rows survives.
And there is no way for a **site** to get plugin tables onto the handle without
naming each plugin's table module itself — automatic would mean the type
generator emitting the installed plugins' table types into `.astro/`, and an
augmentable interface on the public surface for them to land on. That is a
generator feature, not a typecheck fix, and it is not in this branch.

## `check:boot` is a standalone script, not a hook step

The full sequence is an Astro build plus a server start, so it does not belong in
`lint-staged`. It is `scripts/check-boot.mjs`, wired as `npm run check:boot`,
named in `ARCHITECTURE.md`'s gate table, and run by its own CI job.

**What it asserts.** `/` returns 200, `/admin` returns 200, and
`/api/entries/post` returns 401. A server that cannot boot itself answers 500 on
`/` and **404** on `/admin`, and the 404 is the misleading one — it reads as a
routing mistake rather than an empty registry. The 401 distinguishes "route
mounted, caller rejected" from "runtime never booted", which a 500 would not.

An authenticated read is the stronger assertion and was declined. It needs a
seeded database and a sign-in, and the three unauthenticated statuses already
separate every failure mode the boot defect produced.

**What database it uses.** `apps/demo/database.db` is a working file. The check
migrates a fresh one into a temp directory and points the demo at it with
`DATABASE_URL`, which `libsql()` already reads — no new environment variable was
invented, per `roadmap/completed/runtime-boot-and-live-config.md`'s WS5. The
directory is removed on every exit path, including failure.

**The config-evaluation count turned out assertable.** A regression to
double-boot is the specific thing that would undo lazy boot, and it was only ever
measured by hand. `apps/demo/astromech.config.ts` logs one line per evaluation
when `ASTROMECH_LOG_CONFIG_EVAL=1`, and the check counts them in the server's
output, expecting exactly one. The alternative — a counter on `globalThis` — is
not readable from outside the process without inventing a route to expose it,
which is the contortion that was not worth making. The env-var gate keeps the
line silent in ordinary development.
