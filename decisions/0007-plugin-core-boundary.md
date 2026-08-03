# 0007 — how plugin code reaches core

**Date:** 2026-08-04
**Status:** accepted

A plugin's server code and core's server code are loaded by **two different
module loaders**, and only one of them can resolve `virtual:astromech/config`.
Everything a plugin may do to reach core follows from that. This record fixes
the mechanism, because the failure it prevents is a runtime throw rather than a
type error, and because three plausible-looking fixes do not work.

## The constraint

Astro loads `astro.config.mjs`, and therefore `astromech.config.ts` and every
`plugin()` factory, in **plain Node at config time**. A `PluginDefinition` and
every closure hanging off it — `rawRoutes[].handler`, service methods, hooks,
cron handlers — belongs to that Node-loaded copy of the plugin package, whenever
it later runs. Core's runtime is the opposite: the integration injects routes
pointing at package **source** (`pkgSrc` in `kernel/astro.ts`), so Vite compiles
it and the `virtual:` plugin resolves.

|                | how it is loaded         | can it resolve `virtual:`? |
| -------------- | ------------------------ | -------------------------- |
| core runtime   | Vite-compiled from `src` | yes                        |
| plugin runtime | Node-loaded from `dist`  | **no**                     |

This is not a `dist`-versus-source mismatch. The code is the same either way.
The difference is which loader is asked to resolve the specifier.

Reproducible from the demo, against built `dist`:

```
$ node --input-type=module -e "await import('astromech')"         # OK
$ node --input-type=module -e "await import('astromech/fields')"  # OK
$ node --input-type=module -e "await import('astromech/methods')" # ERR_UNSUPPORTED_ESM_URL_SCHEME
```

A closure created in the Node graph can never execute code from the Vite graph.
And if Node somehow could resolve `virtual:`, the result would be worse than the
error: **two copies of core in one process**, sharing only the `globalThis`
registries, with every ordinary module singleton silently diverged.

## Decision

**`ctx` is the only bridge. Capability injection is the mechanism.** A plugin
never imports a core module that executes core's runtime; core builds
`PluginContext` inside its own graph and hands the functions over. New platform
capabilities are added as ports on `ctx`, following `ctx.storage` and
`ctx.database`.

The import rule this makes enforceable: **a plugin package imports `astromech`
and `astromech/ui`, and nothing else from core.** Both load under plain Node
(verified above); `astromech/ui` is browser code and never sees a `virtual:`
specifier at all. Type-only imports from any subpath stay fine, because they
erase. Everything else arrives on `ctx`.

`astromech/methods` is therefore **core-internal in practice**, consumed by the
CLI, the MCP transport and the kernel. It stays published because those live
outside the package, but no plugin may import it. `0008` covers the port that
replaces it for plugins.

## Why this, and not something cleverer

This is what the ecosystem does, in every host that has the same shape.
Fastify passes the (encapsulated) instance into the plugin function; you
decorate what you are given and never import a singleton. Rollup and Vite pass
a `PluginContext` as `this`, with `this.resolve()` and `this.load()`, so a
plugin runs the bundler's own resolution rather than reimplementing it. Payload
hands the initialised `payload` object to `onInit`.

Nuxt is the closest analogue, because it is the same bug. Nitro server code
calls `useRuntimeConfig()` rather than importing the virtual config module,
precisely because a direct import bypasses the builder context the virtual
module needs, and because importing around it is what produces the duplicate
instance (`nuxt/nuxt#35375`). The stated principle is the same everywhere:
expose one small, stable object, and let plugins extend through what they are
given rather than by reaching into internal files.

## Rejected

**`ssr.noExternal` for plugin packages.** Implemented, built, and tested against
a running demo: the error was unchanged. It governs which modules Vite's SSR
graph compiles, and the handler closure was never in that graph. Vite would
compile a second copy of the plugin that nothing calls. Reverted rather than
left in as inert config. Recorded here so it is not tried a third time.

**Teaching Node to resolve `virtual:` with module customization hooks.** This is
a real mechanism, and Node's own documentation demonstrates it for `https://`.
It is the wrong tool. Hooks are process-wide; they must be registered before the
modules they affect are loaded, since static imports evaluate before the code
that registers them; `module.register()` is deprecated as of v25.9.0 in favour
of `registerHooks()`, which is still a release candidate. Decisively: it would
resolve `virtual:astromech/config` to a _second_ config module rather than the
one Vite built, which is the two-copies failure with extra steps.

**Loader injection, the way VS Code does it.** The VS Code extension host
intercepts `require('vscode')` and hands back the live API object; the npm
package is types only. It is the cleanest version of this idea and it is
unavailable to us, because it depends on **the host loading the extension**.
Astro does not load our plugins. The config file does, before core exists.

## Deferred, not rejected

**Entrypoint injection for `rawRoutes`.** Astro's own mechanism for crossing
from config-time Node into request-time Vite is to pass a module specifier
rather than a function: `injectRoute({ entrypoint })` and
`addMiddleware({ entrypoint })`, documented for npm-published integrations as
`entrypoint: '@fancy/dashboard/dashboard.astro'`. Core already relies on this.
`PluginRawRoute.handler` being a closure is where our plugin contract diverges
from the host's, and switching it would put plugin route code inside Vite's
graph, where no port is needed at all.

It is deferred because it solves a different requirement. A plugin that needs to
_be_ in Vite's graph is not the same as a plugin that needs to _call_ core, and
only the second one is blocking anything today. It also cannot help hooks,
service methods or cron jobs, which are closures and always will be. Tracked in
`roadmap/planned/plugin-route-entrypoints.md`, with the costs already measured
there.

## Blast radius

None, today. `@astromech/authoring` is the only package that imports
`astromech/methods`, and it is the only thing this bug has ever broken. The
other five plugins already respect the rule; nothing wrote it down, which is how
`@astromech/authoring` walked past it.
