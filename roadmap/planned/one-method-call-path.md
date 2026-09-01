# One method call path

Make one function the way a method id becomes a service call, for every
transport. Today the REST routes, the manifest RPC route, the tool dispatcher
(MCP, CLI, the AI tool-loop) and the plugin RPC route each resolve, validate,
authorise and invoke by their own code. This file holds the measurement, the
target shape and the stages; it does not change the route table, the manifest
format or the public overloads.

## The three paths, measured

| Path                                                                     | Resolves the method by                                      | Validates with                                                     | Authorises through                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| REST — `packages/astromech/src/transport/http/routes/rest-route.ts`      | route row id + a per-domain contract catalogue, per request | the contract's Zod `input`                                         | `scopedServices(role)`, plus an early `allowsMethod` check               |
| RPC, MCP, CLI, AI — `packages/astromech/src/transport/tools/dispatch.ts` | manifest method, through three resolve strategies × 2 modes | `z.fromJSONSchema(tool.inputSchema)` at each caller, or not at all | `scopedServices(role)` via a lazily imported handle, or the raw services |
| Plugin RPC — `packages/astromech/src/transport/http/routes/plugins.ts`   | the plugin service registry, two path params                | nothing                                                            | `enforceAccess`, its own function                                        |

What the duplication costs, in defects the code itself admits:

- `buildScopedDispatch` refuses every plugin method ("not scoped to a role
  yet"), so the AI tool-loop and `POST /rpc/:id` cannot reach a plugin method
  a role holds, while the MCP server reaches them with no access check at all.
- RPC and the CLI validate against a JSON Schema rehydrated into Zod. A
  refinement or transform on the contract is lost on the way through, so the
  same input can pass over RPC and fail over REST.
- `dispatch.ts` lazily imports every service and `scopedServices` so that
  listing tools pulls in no service code, which is a constraint the tool list
  imposes on the call path rather than the other way round.
- `packages/astromech/tests/transport/http/routes/rpc-parity.test.ts` and
  `packages/astromech/tests/transport/mcp/parity.test.ts` exist to hold the
  paths together. A single path needs neither.

Lines today: `dispatch.ts` 351, `scoped-tools.ts` 61, `rest-route.ts` 318,
`rpc.ts` 67, `routes/plugins.ts` 117, `mcp/tools.ts` 163.

## Target shape

A runtime **method catalogue**, built once at boot beside the manifest, holding
every callable method by its manifest id with its Zod contract intact:

```ts
type CatalogueMethod = {
    id: string; // `users.update`, `entries.post.update`, `plugins.menus.get`
    contract: ServiceMethodContract; // the Zod input, permission, effect flags
    /** Call the method on the given handle with args already pinned (`type`). */
    call: (
        handle: ScopedServices | 'trusted',
        args: Record<string, unknown>
    ) => Promise<unknown>;
};
```

`generateMethodManifest` becomes a projection of the catalogue (serialise each
entry), so the manifest can no longer describe a method the catalogue cannot
call.

One function over it:

```ts
export async function callMethod(
    id: string,
    args: unknown,
    caller: { role: Role | null } | 'trusted'
): Promise<unknown>;
```

It resolves the id, parses `args` with the contract's Zod `input`, refuses a
`sessionScoped` method for a trusted caller, and invokes through
`scopedServices(role)` or the raw service. A plugin method's `access` is
enforced here too, which is what closes the gap above. `PermissionDeniedError`
and `ValidationError` are the only errors it adds; everything else is the
method's own.

Each transport keeps only what is genuinely its own:

- REST: query-string schema, precondition, `args(c)`, the envelope. The
  contract lookup, `safeParse`, the early `allowsMethod` and `invoke` go;
  `PerRequestContracts` goes with them, since the row's `entries.update` plus
  the `:type` param composes the catalogue id. The OpenAPI document still
  reads the contract, now from the catalogue.
- RPC: `callMethod(id, body, caller)` and the envelope. `z.fromJSONSchema`,
  `dispatchArgs` and `callArgs` go.
- Tools: `buildDispatch` keeps the projection (name, annotations,
  `confirmMessage`) and sets `invoke` to `callMethod`. The resolve strategies,
  `CORE_SERVICES`, `invokePluginMethod`, `entriesArgs` and the lazy handle go.
  `resolveScopedMethod` goes.
- Plugin RPC: `callMethod('plugins.<key>.<method>', body, caller)`. A plugin
  method with a declared input schema is validated for the first time.
- CLI `call` and the MCP server pass `'trusted'`.

Depth from a request to the service: handler → `callMethod` → scoped wrapper
→ service method. The same four frames on every transport.

## The work

One branch, `one-method-call-path`, in a worktree at
`../Astromech-worktrees/one-method-call-path`; one commit per stage, each
written by a `coder` sub-agent from this file, reviewed and gated by the main
thread. The manifest JSON must be byte-identical before and after stage 0, and
every route, RPC, MCP, CLI and policies test passes unchanged at every stage.

**Stage 0 — the catalogue and `callMethod`**

- [ ] `buildMethodCatalogue(resolved, plugins)` in `codegen/`, built from the
      same enumeration `method-manifest.ts` does now (core catalogues, per-type
      entry contracts gated by capability, plugin service methods).
      `generateMethodManifest` maps over it. A test asserts the manifest is
      unchanged against the committed fixture.
- [ ] `setMethodCatalogue` in `astromech.ts` beside `setMethodManifest`, on
      the `globalThis` registry.
- [ ] `callMethod` in `policies/`, since what it decides is who may call what.
      Tests: a denied role throws `PermissionDeniedError` before the service is
      reached; an invalid input throws `ValidationError` naming the field; a
      `sessionScoped` method is refused for `'trusted'`; an entries call cannot
      redirect its own `type`.

**Stage 1 — RPC**

- [ ] `rpc.ts` on `callMethod`. `rpc-parity.test.ts` passes unchanged, then is
      cut down to the refusal cases the catalogue still declares (`binaryInput`).

**Stage 2 — REST**

- [ ] `rest-route.ts` on `callMethod`; delete `PerRequestContracts`, `invoke`,
      `isPerRequest` and the early permission check. `entries.ts` and the four
      domain routers lose their `contracts` argument. `openapi-document.test.ts`
      is the check that the document is unchanged.

**Stage 3 — tools, MCP, CLI**

- [ ] `dispatch.ts` down to the projection; `scoped-tools.ts` down to
      `buildScopedTools`. Plugin methods appear in the scoped tool list for a
      role that holds their access. `mcp/tools.ts` and `cli/commands/call.ts`
      call `'trusted'`. The MCP parity test is cut down the same way as RPC's.

**Stage 4 — plugin RPC**

- [ ] `routes/plugins.ts` RPC handler on `callMethod`; `enforceAccess` stays
      only for raw routes, which are not methods. `plugins-contract.test.ts`
      gains a case for a declared input schema rejecting a bad body.

**Stage 5 — close out**

- [ ] `ARCHITECTURE.md` transport bullet names `callMethod` as the one way a
      transport reaches a service. `DECISIONS.md` gains an entry for the
      catalogue (what it beat: rehydrating the manifest's JSON Schema, and a
      per-transport resolve strategy). `exports/methods.ts` keeps its exports;
      anything it exported that no longer exists is removed with a note in
      the commit.

## Not changing

- The route table and its `bodyKey`/`wireNames` remaps. Wire shape is
  `rest-bulk-route-shape.md`.
- The manifest format and `astromech.methods.json`.
- The public single-id overloads on `EntriesService` (`DECISIONS.md`).
- `scopedServices` itself: it stays the one place authority is applied.
