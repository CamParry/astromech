# Manifest-Driven Transports

The method manifest already describes every service method completely: id, Zod
input schema, output schema, permission rule, and the `mutates` /
`destructive` / `idempotent` effect triple. `transport/tools/dispatch.ts` turns
any manifest entry into a callable tool with no per-domain adapter and no switch
over method names, which is how the MCP server and the AI tool-loop reach the
whole service surface for free.

Three transports do not read it, and hand-restate the same facts instead:

| Transport                                               | Lines | Derived from the manifest          |
| ------------------------------------------------------- | ----- | ---------------------------------- |
| `packages/astromech/src/transport/tools/dispatch.ts`    | 357   | entirely                           |
| `packages/astromech/src/transport/http/routes/`         | 1836  | no — 47 hand-written verb handlers |
| `packages/astromech/src/transport/http/client/index.ts` | 862   | no — 48 hand-written URL mappings  |
| `packages/astromech/src/transport/cli/commands/`        | ~500  | no, except `methods.ts`            |

`dispatch.ts` already records what this costs, in its own header: the adapters it
replaced were second declarations of methods that described themselves, and the
second declaration is what drifted — `users_update` advertised a hand-written
schema that rejected custom user fields for months. The lesson was applied to two
transports and not to the other three.

The concrete exposure today is that nothing checks `routes/entries.ts` and
`client/index.ts` against each other or against the contracts they both restate.
`routes/entries.ts` is 1137 lines, over 60% of the HTTP surface, and it
hand-parses query params (`parseQueryParams`, `validateSort` with its own
`SORTABLE_FIELDS` set), builds a `ServiceMethodContract` inline to reach
`permissionsFor`, and hand-shapes every response envelope — while
`packages/astromech/src/entries/methods.ts` declares the real schemas for exactly
those methods a few directories away. Service tests never mount the routers, so a
route that drops a key passes the entire gate.

A related symptom, same root: `OpenAPIHono` is imported by every route file and
`createRoute()` is called five times against 25 raw `router.get`/`router.post`
calls in `routes/entries.ts` alone. The OpenAPI document at `/openapi.json`
therefore describes a small fraction of the API.

## Permission enforcement is part of the same problem

Whether a call is permission-checked currently depends on which transport it
arrived through:

- `transport/local` composes no wrapper (documented as trusted).
- HTTP routes call `permissionsFor(...).allowsMethod` per handler, against a
  contract built at the call site.
- `buildDispatch` carries `permission` and explicitly does not enforce it.
- `buildScopedDispatch` enforces through `policies/scoped-services.ts`.

Each is individually justified. Collectively there is no single answer to "is
this method gated", and the count scales with transports times domains as the
adapters in `roadmap/planned/multi-runtime-and-framework-adapters.md` land.

`policies/scoped-services.ts` states the constraint this work has to respect:
`permissionsFor` stays the seam for checks carrying logic a contract cannot
state — `users.get` allowing self-access without `users:read`, the last-admin
guard. The target is not one mechanism, it is one mechanism plus an enumerated
exception list.

## Change

### 0. Enumerate what cannot be generic

Before anything is collapsed, write down which handlers are genuinely bespoke and
why. Expected members, to be confirmed rather than assumed: `media.upload` and
`media.replace` (`binaryInput`), media serving, the auth routes, `/setup/check`,
the cron poke, the plugin RPC route, notifications (session-scoped — see
`roadmap/planned/domain-shape-convergence.md`), `users.get` self-access, and the
last-admin guard.

- [ ] List every handler in `transport/http/routes/` with the reason it is or is
      not expressible as `(verb, path, method id, argument mapping)`.
- [ ] Record the count that survives. It is the honest measure of what this work
      saves, and it is the number to check the result against.

### 1. An RPC route over the manifest

Additive and independently verifiable, so it lands first and proves the seam
before any existing route is touched.

- [ ] `POST {apiRoute}/rpc/:id` — resolve the manifest method by id from
      `codegen/manifest-registry.ts`, build via `buildScopedDispatch(method, role)`,
      validate the body against the contract's input schema, invoke, return the
      envelope.
- [ ] Refuse with the dispatcher's own `DispatchResult.reason` when the method is
      not callable, so a `binaryInput` method fails with the reason it declares
      rather than a generic 400.
- [ ] Mount after `requireAuth`, so the role is present.
- [ ] Test it the way `tests/transport/mcp/parity.test.ts` tests the MCP
      projection: assert every manifest method is either reachable or refused
      with a declared reason, with no third outcome.

This alone gives an HTTP surface to methods that have none today, and gives the
assistant and any future remote transport one enforced path in.

### 2. A declarative REST route table

The REST surface stays — it is the documented public API and the shape the admin
speaks. What changes is that a route declares itself instead of implementing
itself.

```ts
const ENTRIES_ROUTES: RestRoute[] = [
    { verb: 'get', path: '/:type', id: 'entries.query', args: queryArgs },
    { verb: 'post', path: '/:type', id: 'entries.create', args: bodyWithType },
    // …
];
```

One generic handler reads the table: resolve the manifest method, map the request
to the method's argument object, validate against the contract schema, dispatch
through `scopedServices`, wrap the envelope. The only bespoke code left per route
is the `args` function, which is the one genuinely per-route fact (how path
params and query string become the argument object).

- [ ] Define `RestRoute` and the generic handler in `transport/http/routes/`.
- [ ] Convert one domain first. `settings` (76 lines, 3 handlers) is the
      smallest honest test; `entries` is the payoff and goes last.
- [ ] Delete `parseQueryParams` / `validateSort` / `SORTABLE_FIELDS` from
      `routes/entries.ts` in favour of the contract's own schema, and move any
      sortable-field constraint into `entries/schema.ts` where the rest of the
      entry contract lives.
- [ ] Bespoke handlers from step 0 stay as explicit entries below the table,
      each carrying the reason it is not in it.
- [ ] Emit the OpenAPI document from the table plus the contracts, replacing the
      five hand-written `createRoute()` calls. This is the point at which
      `/openapi.json` starts describing the whole API.

### 3. Generate the fetch client from the same table

Once a route declares `(verb, path, method id)`, the client has no independent
facts left to hold. `client/index.ts` becomes a proxy: look up the route for the
method id, build the URL, fetch, unwrap.

- [ ] Move the route table into a pure data module both halves import. This is
      the `*.shared.ts` convention from
      `roadmap/planned/module-boundary-enforcement.md` step 2 — the table names
      no service and imports no config, so it is browser-safe by construction.
- [ ] Rebuild `astromechClient` as a proxy over the table, keeping
      `AstromechApiError`, `emitApiError` and the `configure({ baseUrl })`
      surface unchanged.
- [ ] Keep the hand-written methods for the bespoke routes (media upload is
      `FormData`, not JSON) and nothing else.
- [ ] The client's static types keep coming from `AstromechClient`, so admin call
      sites do not change and a wrong proxy fails the typecheck.

The alternative — generating a client file at build time via `codegen/` — is
worth naming and rejecting explicitly: it adds a generated artifact to review
and a build ordering constraint, and buys nothing a proxy over shared data does
not already give.

### 4. A generic CLI call path

- [ ] Add `astromech call <method-id> --args <json|@file>` on top of
      `buildDispatch`, alongside the existing `astromech methods`.
- [ ] Decide per command whether the hand-written `entries:*` / `users:*`
      commands stay as ergonomic aliases over `call` or are retired. Their flag
      parsing is the only thing they hold that `call` does not, and for
      `entries:create` that is `--fields @file`, which is worth keeping.

### 5. Close the enforcement question

- [ ] Every route reached through the generic handler is enforced by
      `scopedServices`, so its handler contains no permission code at all.
- [ ] The exception list from step 0 keeps its explicit `permissionsFor` check,
      and each one carries a comment naming the logic the contract cannot state.
- [ ] `ARCHITECTURE.md` gains a sentence stating which transports enforce and
      which are trusted, since that fact currently has to be reconstructed from
      four files.

## Notes / caveats

- **Steps are independently landable and should land separately.** Step 1 is
  additive. Step 2 is a per-domain conversion. Step 3 cannot start before step 2
  produces the table.
- **This is behaviour-preserving for every route it touches**, which means the
  existing route tests are the safety net and should be extended _before_ the
  conversion, not after. `tests/transport/http/routes/` covers 8 files against
  1836 lines of routes; the conversion is the moment to fix that ratio, and
  doing it first is what makes the conversion verifiable at all.
- **Browser-verify the admin after step 3.** The admin is the fetch client's only
  real consumer, and a proxy that returns the wrong envelope shape typechecks
  fine. `apps/demo` on port 4323 is the check.
- The entries route's per-type permission derivation (`entryPermission(type,
action)`) is already what `scopedServices` does for the entries handle, so the
  inline `entryGate` contract at `routes/entries.ts` is duplicated logic rather
  than a special case. Confirm that before deleting it.
- No migration, no stored-data change, no public API change if done correctly —
  the URL surface is preserved by the table.
