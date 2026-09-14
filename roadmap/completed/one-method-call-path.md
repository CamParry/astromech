# One method call path

Make the scoped service handle the one way an untrusted caller reaches a
service method, plugin methods included, and make one function the way a
manifest method id becomes a call. This file holds the measurement, the target
shape and the stages; it does not change the route table, the manifest format
or the public overloads.

## What is true today

Input validation is already shared: `defineService.bind()`, the plugin service
proxy and the plugin RPC route all parse through
`packages/astromech/src/services/parse-method-input.ts`, so every transport
checks the same Zod schema. What still differs is how a method is found and
who decides whether the caller may run it.

| Path                                                                    | Finds the method by                                                        | Authorises through                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| REST, `packages/astromech/src/transport/http/routes/rest-route.ts`      | the route row's id on the scoped handle                                    | `scopedServices(role)`, plus an early check per catalogue |
| RPC, AI tool-loop, `packages/astromech/src/transport/tools/dispatch.ts` | the manifest method, through two resolve strategies with lazy service maps | `scopedServices(role)` for core and entries methods       |
| MCP, CLI, the same `dispatch.ts`                                        | the same, over the raw services                                            | nothing (trusted)                                         |
| Plugin RPC, `packages/astromech/src/transport/http/routes/plugins.ts`   | the plugin service registry, two path params                               | `enforceAccess`, its own function                         |

What that costs:

- `scopedServices(role)` has no `plugins` key, so `buildScopedDispatch`
  refuses every plugin method (`'plugin method — not scoped to a role yet'`).
  The AI tool-loop and `POST /rpc/:id` cannot reach a plugin method even when
  the role holds its access; only the plugin RPC route can, through its own
  check.
- `dispatch.ts` keeps its own map of core services (`CORE_SERVICES`), its own
  plugin invoker (`invokePluginMethod`) and a separate resolve strategy for the
  scoped and trusted cases, all to call what `scopedServices` already exposes.
- `astromech call` still parses its arguments against a Zod schema rebuilt
  from the manifest's JSON Schema, then the method parses them again.
- The REST mount takes either a static catalogue or a per-request one
  (`PerRequestContracts`). The per-request form exists only so the early
  permission check can run for entries and globals, and both already make that
  check in their own `precondition`.
- The plugin route builds each plugin context with the client address, and
  the plugin service proxy cannot, because the address lives on the Hono
  context rather than the request store.

## Target shape

`ScopedServices` gains `plugins`: every registered plugin's service methods,
each wrapped in its declared `access` resolved against the plugin's permission
namespace, the rule `enforceAccess` applies today. It fails closed like the
core domains.

One function maps a manifest method onto a handle:

```ts
export function callMethod(
    method: ManifestMethod,
    args: Record<string, unknown>,
    caller: { role: Role | null | undefined } | 'trusted'
): Promise<unknown>;
```

It picks `scopedServices(role)` or the trusted handle (the raw services and
the plugin service proxy, in the same shape), then calls
`handle.<module>.<method>(args)`, `handle.entries.<method>({ ...args, type })`
with the type pinned from the id, or `handle.plugins.<serviceKey>.<method>(args)`.
A `sessionScoped` method is refused for a trusted caller.

Each transport keeps only what is its own:

- **RPC and the AI tool-loop**: `buildScopedDispatch` projects the tool and
  calls `callMethod(method, args, { role })`. Plugin methods join the scoped
  tool list for a role that holds their access.
- **MCP and the CLI**: `buildDispatch` does the same with `'trusted'`. The CLI
  stops parsing arguments itself.
- **Plugin RPC**: calls the method on `scopedServices(role).plugins` with the body.
  `enforceAccess` stays for raw routes, which are not methods.
- **REST**: keeps calling the scoped handle by the row's id, since its URL
  already names the domain and method. The mount takes one catalogue; a route
  with a `precondition` owns its early permission check.

The client address moves onto the request store, set by the Hono app, so every
context built while serving an API request carries it.

The earlier version of this file proposed a runtime catalogue holding each
method's Zod contract, so every transport could validate against it. Parsing
in `bind()` made that unnecessary: the manifest already names every callable
method, and the handle already holds the contract.

## The work

One branch, `one-method-call-path`, in a sibling worktree as `AGENTS.md`
describes; one commit per stage, each written by a `coder` sub-agent from this
file, reviewed and gated by the main thread, and merged to main when it passes.
The manifest JSON and the OpenAPI document stay byte-identical at every stage.

**Stage 1: plugin methods on the scoped handle**

- [x] `RequestContext` carries `clientAddress`, set by the Hono app's request
      middleware. `currentAppContext()` and the plugin service proxy pass it to
      the context they build.
- [x] `ScopedServices.plugins`, built by a `scopePlugins` in
      `policies/scoped-services.ts`. Tests: a public method runs with no role;
      an authenticated one is refused with no role; a permission-gated one is
      refused for a role without it and runs for a role with it.
- [x] The plugin RPC route calls the scoped handle. A refusal answers 401 when
      nobody is signed in and 403 otherwise, as it does now.
      `plugins-contract.test.ts` passes unchanged.

**Stage 2: `callMethod` and the tool dispatcher**

- [x] `callMethod` in `policies/call-method.ts`, with tests: a denied role
      throws `PermissionDeniedError` before the handler runs; an entries call
      cannot redirect its own `type`; a `sessionScoped` method is refused for
      `'trusted'`; a plugin method runs through its access check.
- [x] `dispatch.ts` down to the projection and the build-time refusals
      (binary input, no schema, session-scoped for a trusted caller). Delete
      `CORE_SERVICES`, `invokePluginMethod`, the resolve strategies and
      `dispatchArgs`.
- [x] `buildScopedTools` stops dropping plugin methods; `annotateManifest`
      marks an `authenticated` plugin method as denied with no role.
- [x] `rpc.ts` and `cli/commands/call.ts` lose their argument shaping; the CLI
      prints a `ValidationError`'s issues.

**Stage 3: one REST catalogue**

- [x] Delete `PerRequestContracts`, `RestContracts` and `isPerRequest`;
      `mountRestRoutes` and `documentBespokeRoutes` take one catalogue.
      Entries' and globals' `contractsForRequest` go. The catalogue check runs
      only for a route with no `precondition`. `rest-route.test.ts` and
      `openapi-document.test.ts` pass unchanged.

**Stage 4: close out**

- [x] `ARCHITECTURE.md` transport and policies bullets name the scoped handle
      as the one way an untrusted caller reaches a service and `callMethod` as
      how a manifest id becomes a call. `DECISIONS.md` gains an entry for
      plugin methods on the scoped handle and for dropping the runtime
      catalogue.

## Not changing

- The route table and its `bodyKey`/`wireNames` remaps. Wire shape is
  `rest-bulk-route-shape.md`.
- The manifest format and `astromech.methods.json`.
- The public single-id overloads on `EntriesService` (`DECISIONS.md`).
- In-process plugin calls through `ctx.plugins`, which stay unscoped.
