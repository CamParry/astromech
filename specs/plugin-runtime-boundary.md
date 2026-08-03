# Plugin runtime boundary — implementation plan

**Status:** decided, implementing
**Rationale:** `decisions/0007-plugin-core-boundary.md` (the mechanism) and
`decisions/0008-plugin-methods-port.md` (the port's shape). Do not re-derive
either here; this file is the build order and gets deleted when it ships.
**Unblocks:** P7 in `roadmap/in-progress/ai-integration.md` — the chat drawer
500s on every send with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.

## What is being built

`ctx.methods.tools({ readOnly })`, returning the manifest methods the current
request's role may call, each dispatched through `scopedService`.
`@astromech/authoring` drops every value import of `astromech/methods` and
builds its tools from the port.

## Where the injection happens, and why not at boot

The port's implementation must be a **Vite-graph closure**, and `initRuntime`
cannot supply one: `kernel/astro.ts` calls it inside `astro:config:setup`, which
runs in plain Node. A port wired there would inject exactly the closure that
cannot resolve `virtual:`.

The precedent to copy is `setPluginClient`. `transport/local/index.ts` calls it
at **module top level** (side effect on import), so whichever graph evaluates
that module is the graph the plugin's `ctx.entries` runs in. On every server
path that reaches a plugin raw route, that is Vite. The methods port is wired
the same way, on the same line.

This is also why `ctx.methods.tools()` is **synchronous**. An injected
implementation needs no `await import(...)` at the call site.

## Dependency-cruiser constraints that shape the layout

Two rules decide where things live. Neither may be relaxed.

- **`plugins-runtime-is-a-capability`** forbids `src/plugins/runtime/` from
  importing `policies/`, `transport/` or `codegen/`. So `plugin-runtime.ts`
  cannot import the surface builder at all, dynamically or otherwise. It holds
  an injected implementation, exactly as it holds the client.
- **`leaves-are-pure`** forbids `src/types/` from importing anything outside
  `types|utilities|errors`. So `types/plugins.ts` cannot name `ToolDispatch`
  while it lives under `transport/`. The type moves down; the value stays put.
- **`policies-no-upward`** forbids `policies/` from importing `transport/`,
  which is where `buildScopedDispatch` lives. The surface builder therefore
  sits beside the dispatch it composes rather than in `policies/`.

## Build order

**1. Move the dispatch types down.** `ToolDispatch` and `ToolAnnotations` move
from `src/transport/mcp/dispatch.ts` into `src/types/services.ts`, beside
`ManifestMethod` and `MethodManifest`. `dispatch.ts` re-exports both so
`astromech/methods` and every existing import are unchanged.

**2. `src/transport/mcp/scoped-tools.ts`** — new.

```ts
buildScopedTools(
    principal: Role | undefined,
    options?: { readOnly?: boolean }
): ToolDispatch[]
```

Composes, in this order: read the manifest from `getMethodManifest()` (throw if
absent — it is populated at boot, so a missing one is a wiring bug), drop
`source === 'plugin'` methods, `reduceSurface`, `annotateManifest` filtered to
`allowed !== false`, then `buildScopedDispatch` per method, skipping any that
returns `ok: false`.

This is `buildAuthoringTools` from `packages/plugins/authoring/src/loop/tools.ts`
with the `betaTool` wrapping removed. Move its three explanatory comments with
it — the plugin-source refusal, the advisory-vs-enforcing note, and why
`allowed === null` is kept. It lives under `transport/mcp/` because
`policies-no-upward` forbids the alternative and because it composes
`dispatch.ts`; say so in the docblock, since the file serves the AI loop and not
only MCP.

Export it from `src/exports/methods.ts`.

**3. `src/types/plugins.ts`** — the port type and the context field.

```ts
export type PluginMethods = {
    /**
     * Every manifest method the acting role may call, dispatch-ready and
     * already scoped. Plugin-source methods are absent: they carry an `access`
     * the HTTP RPC route enforces separately, so there is nothing to scope
     * them with.
     */
    tools(options?: { readOnly?: boolean }): ToolDispatch[];
};
```

Added to `PluginContext` next to `storage` and `database`, documented as a
capability port. `ToolDispatch` is a type-only import from `types/services.js`
after step 1.

**4. `src/plugins/runtime/plugin-runtime.ts`** — hold and expose it.

Add `methods: PluginMethodsAccess | null` to `PluginRuntimeState`, where the
injected shape takes the principal explicitly:

```ts
type PluginMethodsAccess = {
    tools(principal: Role | undefined, options?: { readOnly?: boolean }): ToolDispatch[];
};
export function setPluginMethods(access: PluginMethodsAccess): void;
```

On the context, a `get methods()` returning `{ tools: (options) => require(...)
.tools(getCurrentRole() ?? undefined, options) }`. The role is read **at call
time**, like `get role()` and the domain getters above it. Unwired is
crash-loud, worded like `requireClient()`.

**5. `src/transport/local/index.ts`** — wire it, on the line after
`setPluginClient(Astromech)`:

```ts
setPluginMethods({ tools: buildScopedTools });
```

**6. `src/index.ts`** — export `formatAIContextMessage` and the `AIContextEntry`
type from the main barrel. It stays on `astromech/methods` as well.

**7. `@astromech/authoring`** — drop every value import of `astromech/methods`.

- `loop/tools.ts` keeps only `toRunnableTool` and `errorMessage`, taking
  `ToolDispatch[]`. `buildAuthoringTools` is gone; core builds the surface.
- `loop/run.ts` takes the dispatches (or the `ctx.methods` port) from the route
  rather than building them, and imports `Role` as a type only.
- `loop/request.ts` imports `formatAIContextMessage` from `astromech`.
- `routes/chat.ts` calls `ctx.methods.tools({ readOnly: options.readOnly })` and
  passes the result into the loop.
- The request-time `await import('../loop/run.js')` **stays**, but its comment is
  now wrong and must be rewritten: the reason is no longer module resolution, it
  is that a static import would pull `@anthropic-ai/sdk` into every config load.
- Its tests mock `astromech/methods`; they mock the port instead. Keep the
  existing coverage of the request assembler and SSE framing untouched.

**8. `apps/docs/plugins/authoring.md`** — replace the "not reachable yet"
warning with the real pattern. The intent the old snippet described (call as the
caller, not as the plugin) is what `ctx.methods` does, so the section keeps its
point and changes its mechanism. Add the import rule from `0007`: a plugin
imports `astromech` and `astromech/ui`, and reaches everything else through
`ctx`.

**9. `npm run check:node-imports`** — new gate step, because nothing catches
this class today and a unit test never will (vitest aliases core to `src` and
shims `virtual:`, so the failing import passes there).

A script that spawns plain `node` against built `dist` and imports each subpath
a plugin or an Astro config is entitled to load: `astromech`, `astromech/astro`,
`astromech/fields`, `astromech/columns`. Non-zero exit naming the subpath and
the error code. It asserts the allow-list loads; it does not assert that
anything fails, so narrowing a subpath later is not a test change.

Needs `dist`, so it runs after `npm run build`. Add a row to the gate table in
`ARCHITECTURE.md`.

## Verification

The gate, then a running demo. A unit test cannot catch the original bug.

1. Merge to `main` and verify there. A worktree resolves `node_modules` and
   `dist` to the main checkout, so `apps/demo` runs main's code rather than the
   branch's (`project_worktree_browser_verify_trap`).
2. `apps/demo/.env` needs `BETTER_AUTH_URL` matching the port, or sign-in 403s
   on the origin check.
3. **Use a deliberately invalid `ANTHROPIC_API_KEY`.** Module resolution fails
   long before any network call, so a fake key proves the fix and bills nobody.
   Success looks like an authentication error from the API surfacing in the
   transcript; failure looks like `ERR_UNSUPPORTED_ESM_URL_SCHEME` in the server
   log. Testing with no key set proves nothing: the missing-key 503
   short-circuits before the loop imports anything.

## Out of scope

Tracked in the P7 roadmap entry, not blockers: the assistant is `readOnly: true`
until there is a confirm UI, the drawer has no markdown rendering or i18n, the
API base is `/api` hardcoded, and the 147-tool surface still needs
`defer_loading` plus tool search. Also deferred, with its own file:
`roadmap/planned/plugin-route-entrypoints.md`.
