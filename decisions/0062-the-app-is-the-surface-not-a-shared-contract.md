# 0062 — The application is the in-process surface; the fetch client is typed by the wire

**Date:** 2026-08-17
**Status:** accepted

`AstromechClient` (`packages/astromech/src/transport/astromech-client.shared.ts`)
was one contract over two transports: the in-process object at
`transport/local/index.ts` and the fetch client at `transport/http/client/`. It
is deleted, and with it `transport/local/` and the `astromech/local` subpath.
`boot/application.ts` composes the domain services onto the application instance
directly, and `astromechClient` is a standalone REST wrapper typed by what the
wire returns.

## Why one contract over two transports was the wrong shape

The two implementations do not do the same thing, and the contract was carrying
two members that existed only to make them look as though they did.

- **`configure({ baseUrl })` was a no-op in process.** The in-process object
  implemented it with an empty body and a comment saying direct DB access has no
  base URL. A method implemented only to satisfy a name means the contract is
  fighting the implementation and losing. It now lives on `astromechClient`,
  which is the only object that was ever called with it
  (`src/admin/main.tsx`).
- **`config: ResolvedConfig` was never assigned on the fetch side.** It read
  `config: null as unknown as ResolvedConfig`, commented "will be set in
  middleware". Nothing has ever set it. A consumer following the type would have
  read `null` through a non-nullable field. It is deleted, not repaired: the
  browser has the admin config, and the server has `getConfig()`.

The shapes diverge everywhere it matters. `entries.query` in process returns
full rows; over the wire it returns a public projection unless `full` is sent
(`entries/operations/query.ts` — `markPublic`, sanitised rich text, private
fields stripped). `GET /settings/:key` answers `{ data: { key, value } }`, a
shape no service method has. `notifications.count` answers `{ data: { count } }`
and the client unwraps it to a scalar. `media.upload` and `media.replace` send
`FormData` and have no route row at all. `users.query` reshapes `sort`, because
a multi-key sort has no wire form. Every entry in the client's `OVERRIDES` is
one of these. The client's types are therefore written against the wire, never
re-derived from the service types.

## What still holds parity

Parity between the transports was the point of the shared type, and it is not
abandoned — it moves from a declaration to a mechanism. The HTTP surface derives
from the same services through the method manifest and dispatch, so a method
added to a service reaches the wire without a second declaration, and a specific
guarantee gets a test:
`packages/astromech/tests/transport/http/routes/rpc-parity.test.ts` asserts the
REST and RPC paths answer alike, the way
[0056](0056-better-auth-owns-the-users-format-not-its-ddl.md) made the users
format a test rather than a shared type.

## Import side effect → explicit port

`transport/local/index.ts` called `setPluginClient(...)` and
`setPluginMethods(...)` at module top level. That was an import-order contract:
whichever module happened to import the local transport first armed the plugin
runtime, and five tests depended on the bare `import '@/transport/local/index'`
doing it.

The registration is now `wirePluginAccess()` in
`packages/astromech/src/boot/plugin-access.ts`, called from
`boot/lifecycle.ts` beside `wireEntryAccess()` and `wireNotifyAccess()`, before
`registerPlugins`. It has to be a call and not a bare import: the package
declares `"sideEffects": false`, so `import './plugin-access'` is tree-shaken out
of the build and the port never registers. `entries/plugin-access.ts` set that
precedent; this follows it.

What it cost: every consumer that reached the ports through an import now needs
the call. In the suite that is one line in `tests/_support/harness.ts`, beside
the `wireEntryAccess()` it already made, which covers every harness-based test.

## The narrow slice, not the instance

`wirePluginAccess` injects an explicit object literal of the six handles
`plugins/runtime/client-access.ts` declares — `entries`, `media`, `settings`,
`users`, `notifications`, `plugins` — and nothing else.

Passing the `Astromech` instance would have type-checked structurally, and it
would have handed every plugin `config: ResolvedConfig` (the live `db`,
`storage`, `email` and `ai` driver objects, not the sanitised `PluginConfigView`
`ctx.config` projects), plus `fetch`, `scheduled` and `startScheduler`. A plugin
could then serve an HTTP request or start the scheduler from inside a hook. The
slice is what `ClientAccess` has always declared; the change is that the
composition root now states it as a literal instead of relying on a wider object
satisfying it.

## `"sideEffects": false` is still not literally true

Deleting these two calls removes the last module-scope side effect the **plugin
runtime** depends on, which is what made the declaration load-bearing. It does
not make the declaration true. The admin registries, the HTTP routers in
`transport/http/routes/*.ts` (each registering itself on an `OpenAPIHono` at
module scope) and `runMain` in `transport/cli/index.ts` are all still
module-scope effects. Rebuilding the Hono app from a `ResolvedConfig` at boot is
a separate piece of work; until it lands, the declaration is an approximation and
should be read as one.

## The `astromech/local` subpath

Retired: the code behind it is gone. Its consumers call `getAstromech()` from the
root barrel, which the config-at-boot rule makes honest — no core module on that
path carries a `virtual:` import, and `check:node-imports` proves it. This also
removes the last exemption in `check-exports-parity.mjs`, which
[0060](0060-exports-conditions-agree-within-an-entry.md) filed as belonging to
this stage. "Local" leaves the vocabulary with it: no local/remote pair remains,
and `astromech/fetch` is named for its mechanism rather than for a counterpart.

This supersedes [0039](0039-a-contract-lives-with-the-layer-that-implements-it.md)
on where `AstromechClient` lives, by removing the type rather than moving it. The
rule 0039 states — a contract lives with the layer that implements it — survives
it.
