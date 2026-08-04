# 0008 — `ctx.methods`, and what shape it takes

**Date:** 2026-08-04
**Status:** accepted

`0007` settles that a plugin reaches core through `ctx`. This record settles
what the port for the method manifest looks like, because the obvious shape (a
faithful re-export of what `astromech/methods` publishes) is the wrong one.

## Decision

One port, one method:

```ts
ctx.methods.tools(options?: { readOnly?: boolean }): ToolDefinition[]
```

It returns the manifest methods the **current request's role** may call, each
already resolved into a dispatch that calls through `scopedServices`. Core
applies, in order: drop plugin-source methods, `filterMethods`,
`annotateManifest`, `buildScopedDispatch`. The caller wraps each result in
whatever its model SDK wants and does nothing else.

It is async because `plugin-runtime.ts` is itself loaded at config time, so the
accessor's imports must be lazy (`await import(...)`). A static import of
`policies/scoped-services.js` there would break `astro dev` at integration load,
which is the trap `request-context/request-context.ts` already exists to avoid.

## Why core owns the surface policy

The alternative was a narrow `ctx.methods.dispatch(method)` with the plugin
doing its own filtering, which keeps the public `PluginContext` addition
smaller. It lost for two reasons.

The composition is not obvious and it is security-relevant. Three of the four
steps look optional and are not: plugin-source methods dispatch through a path
that builds a `PluginContext` without enforcing the method's declared `access`
(the HTTP RPC route does that separately), so there is nothing to scope them
with and they must be dropped rather than refused. `annotateManifest` is
advisory and `buildScopedDispatch` is what actually refuses, so a plugin that
kept only the annotation would have built a surface that looks filtered and is
not. Handing a plugin four seams and a required order is handing it four chances
to get the order wrong, once per plugin.

And the plugin's remaining job is genuinely its own. `betaTool` is the Anthropic
SDK's shape, not ours; core should not know it exists. The seam falls exactly
where the vocabulary changes.

`readOnly` stays an argument rather than a policy core decides, because it is
the plugin's option to expose. `include`/`exclude` are deliberately not
plumbed through yet: `filterMethods` supports them, no caller wants them, and an
unused option is a contract to keep.

## Naming

**`methods`**, because it is already the word here: the method manifest,
`astromech/methods`, `astromech methods` on the CLI. A reader who has met any of
those guesses this correctly. It was checked against the alternatives rather
than assumed: `ctx.ai` and `ctx.assistant` name a consumer rather than the
thing, and would be wrong the moment a non-AI caller wants a dispatch table;
`ctx.manifest` names the data and not the capability, and the port does not hand
back the manifest.

**`tools`** is the ecosystem's word for a model-callable function, fixed by MCP
and by every model SDK. `ToolDefinition` already carries that vocabulary through
core. The alternative was to call them methods too and let the caller do the
projection, which is a second name for a thing the manifest already projects.

## `formatAIContextMessage` does not go here

It is pure, it imports nothing, and it has nothing to do with methods. It ships
from the **`astromech` main barrel** instead, which is the plugin-authoring
surface and loads under plain Node. Hanging it off `ctx.methods` would put an
unrelated formatter behind a capability port to work around a barrel it was
never meant to share; `0007`'s rule ("a plugin imports `astromech` and
`astromech/ui`") is what makes the barrel the right home.

It stays exported from `astromech/methods` as well, for core's own callers.

## Rejected: a `globalThis` registry

Core stashes the seam functions on a registry during `initRuntime` and the
Node-loaded plugin reads them without importing anything. This works, it touches
no public type, and it is consistent with how `getMethodManifest` already
crosses this boundary.

It lost because it is a worse public API than `ctx` for the same capability:
untyped at the boundary, discoverable only by reading core, and it gives plugin
authors a second way to reach core that competes with `ctx` instead of
reinforcing it. `0007` is only enforceable as a rule if there is one way to obey
it. The registry stays the right tool for what it already does — moving a
generated artefact from boot to request time — and the wrong one for publishing
a capability.
