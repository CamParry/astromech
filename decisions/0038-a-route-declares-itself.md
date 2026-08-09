# 0038 — A route declares itself, and one table is read by handler, document and client

**Date:** 2026-08-09
**Status:** accepted

`transport/tools/dispatch.ts` had already recorded the lesson in its own header:
every per-domain adapter it replaced was a second declaration of a method that
already described itself, and the second declaration is what drifted —
`users_update` advertised a hand-written schema that rejected custom user fields
for months. The lesson had been applied to two transports and not to the other
three. `transport/http/routes/` held 47 hand-written verb handlers and
`transport/http/client/index.ts` held 48 hand-written URL mappings, and nothing
checked either against the other or against the contracts they both restated.

A REST route is now data. One row states `(verb, path, method id)` plus the wire
facts neither side can derive — the success status, the response envelope, the
key a request body lands under, and the names the wire uses where they differ
from the method's arguments. `mountRestRoutes` attaches a generic handler,
`documentRoute` writes the row into `/openapi.json`, and `astromechClient`
builds its URL, body and unwrapping from the same row. The only per-route server
code left is `args`: how path params, query string and body become the method's
argument object, which is the one genuinely per-route fact.

`routes/entries.ts` went from 1137 lines to 756, `transport/http/routes/` from
2009 to 1783, and `client/index.ts` from 862 to 511. The line count is not the
point; the point is that a route's path is now stated once, and the client
cannot address a URL the server does not serve.

## The audit came first, and gave a number to check against

Before anything was collapsed, all 56 handlers in the Hono app were enumerated
against a stated definition of "generic" — fully described by `(verb, path,
method id, args, success status, envelope)` where the envelope is one of a
closed set, plus four preconditions read from the manifest rather than restated.
35 collapsed into the table; **21 stayed bespoke**, and the conversion landed on
exactly that split.

The audit is what stopped the work being an argument. It confirmed the expected
members — `media.upload` / `media.replace` (`binaryInput`), `/setup/check`, the
cron poke, the plugin RPC route, `users.get`'s self-access, the last-admin guard
— and it **refuted** notifications, which the roadmap had listed whole: since
`decisions/0037-session-scoped-service-methods.md`, three of its four handlers
are generic and only `count` is bespoke, and only because it wraps a scalar. It
also found eleven cases nobody had predicted, among them the per-field
capability 409s on create and update, `DELETE /entries/:type/:id` choosing its
method id from the type's `trash` capability, and both `entry-types` handlers,
which have no service method behind them at all.

A bespoke handler is still public API, so a row may declare a route's path and
schema without naming a generic handler for it: it carries `handler: 'bespoke'`,
`documentBespokeRoutes` puts it in the document, and the handler stays
hand-written beside it with a comment naming the logic no contract can state.
Twelve of the 21 are documented that way — every one with a contract behind it.
The nine that are not are the two multipart media routes and the seven handlers
with no service method.

## An RPC route, so a method with no REST surface still has one

`POST {apiRoute}/rpc/:id` resolves any manifest method by id, builds it through
`buildScopedDispatch(method, role)`, validates the body against the contract's
own input schema and invokes it. It landed first, before any existing route was
touched: additive, independently verifiable, and it proved the seam.

It refuses with the dispatcher's own `DispatchResult.reason`, so `media.upload`
fails as binary input rather than as a generic 400. Its test holds the property
`tests/transport/mcp/parity.test.ts` holds for the MCP projection — every
manifest method is either reached or refused with a declared reason, with no
third outcome. `astromech call <method-id> --args <json|@file>` is the same
shape on the CLI, over `buildDispatch`, which is the trusted path and so refuses
a `sessionScoped` method with the reason it declares.

## The table lives beside the routes, identified by its name

It spent one pass at `types/http-routes.shared.ts`, because
`client-is-over-the-wire` let the fetch client reach the pure leaves and nothing
else. It now lives at `transport/http/routes/http-routes.shared.ts`, and the
rule reads the `*.shared.ts` marker instead.

The table is transport vocabulary, not the cross-layer domain vocabulary
`types/` holds; `decisions/0036-one-layer-table-and-a-shared-suffix.md` added
the marker precisely so a browser-safe file is identified by its name rather
than by an allowlist or by which directory happens to hold it; and
`roadmap/planned/domain-owned-service-contracts.md` is about moving transport
contracts _out_ of `types/`, so putting a new one there works against the next
item. Teaching the rule the marker is not an exemption — it is the allowance
`admin-only-client-and-pure-leaves` already carries, and
`shared-files-stay-browser-safe` holds anything carrying it to importing only
what the admin may import.

## Rejected: generating a client file at build time

The obvious alternative to a proxy, and the one `codegen/` already has the
machinery for. It loses on two counts: it adds a generated artifact to review on
every route change, and it adds a build-ordering constraint between the table
and the client. A proxy over shared data buys the same guarantee with neither.
The client's static types keep coming from `AstromechClient`, so a wrong proxy
fails the typecheck and the admin's call sites never changed.

Seven client methods still wrap a route the row cannot fully describe — the
admin's full-shape default, a query string the service params do not match
one-to-one, a 404 that means "no value" — and each still takes its URL from the
table. `media.upload` and `media.replace` are written out end to end, because
`FormData` has no row to read.

## Rejected: retiring REST for the RPC route

`POST /rpc/:id` reaches every method, so the REST surface is redundant in the
strict sense. It stays because it is the documented public API and the shape the
admin speaks, and because a URL is a better thing to hand a caller than a method
id. The two coexist: REST is the curated surface, RPC is the complete one.

## Rejected: retiring the hand-written CLI commands

`astromech call` reaches everything the eleven `entries:*` / `users:*` commands
reach, and they were the obvious next thing to collapse. They stay, because the
duplication this record is about is not present in them: they restate no schema,
no permission, no URL and no envelope, so there is no second declaration to
drift. What they hold is a flag surface `call` cannot offer — `--fields @file`,
`--publishAt` coerced into a `Date` that JSON has no form for, and
`users:create`'s password prompt and the Better Auth credential row it writes,
which `users.create` does not write at all. Rewriting them as aliases would keep
every `args` block and replace a three-line body with an indirection.

## What deliberately did not collapse: the enforcement residues

`policies/scoped-services.ts` states the constraint: `permissionsFor` stays the
seam for checks carrying logic a contract cannot state. So the target was never
one mechanism — it was one mechanism plus an enumerated exception list, and the
list is the 21 bespoke handlers.

Two residues sit inside otherwise generic routes, and both were predicted:
`status: 'published'` on an update demands the publish grant, which
`scopedServices` cannot see from the method it is scoping; and the entries
routes read `entryPermission(type, action)` before resolving the type, so an
unknown type answers 403 to an under-privileged role and 404 to a privileged
one. The second is not enforcement — `scopedServices` refuses the call whatever
it returns — it is the order of refusals, and no contract can stand in for it
because an unresolved entry type has none.

`entryGate` was confirmed to be duplicated logic rather than a special case:
`allowsMethod` reads only `contract.permission`, so its `mutates` and
`destructive` fields were dead on arrival and the whole call reduced to what
`scopeEntries` already runs. `ARCHITECTURE.md` now carries the invariant that
had to be reconstructed from four files — enforcement is a property of the
handle, the untrusted transports compose `scopedServices`, and the trusted ones
compose nothing and say so.
