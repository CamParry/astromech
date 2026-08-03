# Plugin runtime boundary — handoff

**Status:** blocked, needs a design decision before implementation
**Found:** 2026-08-04, while sending the first real message through the P7 chat drawer
**Blocks:** `@astromech/authoring` — the drawer 500s on every send

## The symptom

`POST /api/plugins/authoring/chat` returns 500. The server logs:

```
[Astromech API] Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in:
file, data, and node are supported by the default ESM loader. Received protocol 'virtual:'
    at throwIfUnsupportedURLScheme (node:internal/modules/esm/load:187:11)
```

Everything else in the plugin works. The drawer renders, the slot loads, the
route is mounted, auth and permissions pass, the body validates, the missing-key
503 path works. It fails at the first line that needs core's services.

## The cause

Astro loads `astro.config.mjs` — and therefore `astromech.config.ts`, and
therefore every `plugin()` factory — in **plain Node at config time**. The
`PluginDefinition` a site registers, and every closure hanging off it including
`rawRoutes[].handler`, belongs to that Node-loaded copy of the plugin package.

So when a request reaches the handler, its imports resolve through **Node's ESM
loader**, not Vite's. `astromech/methods` pulls in
`policies/scoped-service.ts`, which eagerly imports all five domain services,
each of which imports `virtual:astromech/config`. Node cannot resolve a
`virtual:` specifier. It throws.

Core does not have this problem because **core's runtime code is never loaded
from `dist`**. The integration injects routes pointing at package _source_
(`pkgSrc`, `kernel/astro.ts`), so Vite compiles them and the `virtual:` plugin
resolves. The asymmetry is the whole bug:

|                | how it is loaded         | can it resolve `virtual:`? |
| -------------- | ------------------------ | -------------------------- |
| core runtime   | Vite-compiled from `src` | yes                        |
| plugin runtime | Node-loaded from `dist`  | **no**                     |

Every other first-party plugin works because it never imports core services at
all — it reaches them through `ctx`, which core constructs inside its own
Vite-compiled graph and hands over. **`ctx` has always been the bridge.** That
was not written down anywhere, so `@astromech/authoring` walked straight past
it.

## What was tried and did not work

**`ssr.noExternal` for plugin packages** (`kernel/astro.ts`). The reasoning was
that plugin packages live in `node_modules`, Astro externalises those for SSR,
and pulling them into Vite's graph would make `virtual:` resolvable. It was
implemented, built, and tested against a running demo: **the error was
unchanged**.

It cannot work, and the reason is worth keeping so nobody tries it twice. The
handler closure was created by the config-time Node import. `ssr.noExternal`
governs which modules Vite's SSR graph compiles; it has no effect on a closure
that was never in that graph. Vite would compile a _second_ copy of the plugin
that nothing calls. The change was reverted rather than left in as inert config.

## What this invalidates

`astromech/methods` is **unusable from a plugin package at runtime**, and it
fails at _import_ time rather than at call time, because `exports/methods.ts`
statically re-exports `scopedService`. Merely importing the subpath loads the
whole domain-service graph.

That makes this, in `apps/docs/plugins/authoring.md` ("Calling as the caller,
not as the plugin"), **broken advice** that will fail for anyone who follows it:

```ts
import { scopedService } from 'astromech/methods'; // dies under Node

const scoped = scopedService(ctx.role ?? undefined);
```

The advice is right about intent — an untrusted call path should use the scoped
handle — and wrong about the mechanism. Corrected in place with a pointer here;
it needs a real replacement once this is decided.

Note the blast radius is limited today: `@astromech/authoring` is the only
package that imports `astromech/methods`. Nothing else is broken by this.

## Options

### A. Surface the seams on `PluginContext` (recommended)

Add something like `ctx.methods` alongside `ctx.storage` and `ctx.database` —
the existing, documented pattern for "a platform resource a plugin may not
construct itself" (`ARCHITECTURE.md`, "Plugin capability ports"). Core builds
`ctx` inside its Vite-compiled graph, so the functions execute where `virtual:`
resolves, and the plugin imports nothing.

The narrow shape is better than a faithful re-export. Rather than five loose
functions, expose the one thing a tool-loop actually wants:

```ts
ctx.methods.tools({ readOnly?: boolean }): ToolDispatch[]
```

already scoped to `ctx.role`. Every security decision — the plugin-source
refusal, the scoped dispatch, the advisory-vs-enforcing distinction between
`annotateManifest` and `buildScopedDispatch` — then stays in core where it is
tested, and the plugin's job shrinks to wrapping each dispatch in `betaTool`.
`buildAuthoringTools` in `src/loop/tools.ts` mostly moves into core.

`formatAIContextMessage` needs a home too. It is pure and imports nothing, so
either give it a service-free subpath or hang it off `ctx.methods` as well —
today it is unreachable only because it shares a barrel with `scopedService`.

Cost: a public API addition on `PluginContext`, which is a type every plugin
sees. Needs a name that is not a coinage — `methods` is already the established
word here (method manifest, `astromech/methods`), so it is probably right, but
worth five minutes.

### B. A `globalThis` registry populated at runtime boot

Core stashes the seam functions on a `globalThis` registry during `initRuntime`;
the Node-loaded plugin reads them without importing anything, and calling them
runs core's Vite-loaded closures. Consistent with `defineRegistry` and with how
`getMethodManifest` already crosses this exact boundary
(`codegen/manifest-registry.ts`), and it touches no public type.

Cost: a grab-bag on `globalThis` is a worse public API than `ctx`, it is
untyped at the boundary, and it gives plugin authors a second way to reach core
that competes with `ctx` rather than reinforcing it.

### C. Make plugin runtime code Vite-compiled

Ship plugin server code as source and have the integration alias it, the way
`astromech/ui` and plugin admin components already work. Most faithful to how
the client half is solved.

Cost: much larger. It changes what a plugin package publishes, affects all five
existing plugins, and does not obviously survive `astro build` for a
third-party package installed from npm.

**Recommendation: A.** It reinforces the rule that already governs every working
plugin, keeps the security-relevant code in core, and shrinks the plugin. B is a
reasonable fallback if the `PluginContext` addition feels too heavy.

## If A is chosen — where to work

- `src/types/plugins.ts` — `PluginContext`, add the port and its type.
- `src/plugins/runtime/plugin-runtime.ts` — `createPluginContext`. **The imports
  must be lazy** (`await import(...)` inside the accessor). This module is also
  loaded at config time, and a static import of `policies/scoped-service.js`
  here would break `astro dev` at integration load — the same trap that
  `context/request-context.ts` exists to avoid. `npm run check:config` catches
  it.
- Move the surface-building logic out of
  `packages/plugins/authoring/src/loop/tools.ts` into core, with its tests.
- `packages/plugins/authoring/src/loop/{tools,run,request}.ts` — drop every
  `astromech/methods` import. Type-only imports are fine; they erase.
- `apps/docs/plugins/authoring.md` — replace the corrected warning with the real
  pattern.
- `ARCHITECTURE.md` — the invariant is already recorded under "Plugin runtime
  boundary"; update it if the answer changes.

## How to verify

A unit test will not catch this. It only appears when the plugin is loaded the
way Astro loads it, so it has to be a running demo.

1. Worktree needs its own resolution: full `npm install` in the worktree, then
   `NODE_OPTIONS=--max-old-space-size=8192 npm run build`, then `npm run db:init`
   followed by `npm run db:seed`. A partial install leaves `@astrojs/react`
   missing and Vite 403s serving it from the parent checkout, which looks like a
   blank admin page. See `project_worktree_browser_verify_trap` in memory.
2. `apps/demo/.env` needs `BETTER_AUTH_URL` matching the port you run on, or
   sign-in 403s on the origin check.
3. **Use a deliberately invalid `ANTHROPIC_API_KEY`.** The module-resolution
   failure happens before any network call, so a fake key still proves the fix:
   success looks like an auth error from the API surfacing in the transcript,
   not `ERR_UNSUPPORTED_ESM_URL_SCHEME` in the server log. No real key, nothing
   billed.
4. The missing-key 503 short-circuits before the loop imports anything, so
   testing without a key set proves nothing about this bug.

## Out of scope

Not blockers for this, tracked in the P7 roadmap entry: the assistant is
`readOnly: true` until there is a confirm UI, the drawer has no markdown
rendering or i18n, the API base is `/api` hardcoded, and the 147-tool surface
still needs `defer_loading` plus tool search.
