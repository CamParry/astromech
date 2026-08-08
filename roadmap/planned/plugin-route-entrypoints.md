# Plugin Route Entrypoints

`PluginRawRoute.handler` is a closure. Astro's equivalent takes a module
specifier. That divergence is why plugin route code runs in Node's module graph
instead of Vite's, and so why it cannot reach anything core resolves through
`virtual:` (`decisions/0007-plugin-core-boundary.md`).

**Status:** filed, not started. `0007` closed the immediate hole with a
capability port on `ctx`; this item is about whether the contract itself should
change.

## The shape

Today:

```ts
rawRoutes: [{ method: 'POST', path: '/chat', access, handler: (req, ctx) => ... }]
```

Astro's own mechanism for crossing config-time Node into request-time Vite,
documented for npm-published integrations:

```ts
injectRoute({ pattern, entrypoint: '@fancy/dashboard/dashboard.astro' });
addMiddleware({ entrypoint, order });
```

The equivalent here would be `entrypoint: '@astromech/assistant/routes/chat'`,
with the file exported from the plugin's `package.json`. Core collects the
entrypoints at `config:setup` and emits them as static imports into a generated
module, the way it already generates the admin's plugin components. Vite
compiles the handler, `virtual:` resolves, and a plugin route can import
anything core publishes with no port in between.

The principle behind this is no longer local to plugin routes.
`roadmap/planned/runtime-boot-and-live-config.md` adopts the same rule for the
config itself, on Astro's own stated reasoning: a function cannot cross a build
boundary, so pass a path to an entrypoint and let the bundler load it. If that
lands first, this item is applying an established pattern rather than proposing
one, and `decisions/0007-plugin-core-boundary.md` can stop treating
`PluginRawRoute.handler` as deferred.

## What it would buy

Whole-class rather than per-capability. Every future core surface becomes
reachable from a plugin route for free, instead of each one needing a port added
to `PluginContext`. It also removes the asymmetry that made this a trap: core
routes are already injected as entrypoints, and only plugin routes are closures.

## What it costs

- **The closure captures resolved options.** `buildBackupRoutes(keep)` and
  `chatRoutes(options)` both close over the plugin's resolved config. An
  entrypoint module cannot close over anything, so it would read from
  `ctx.config` instead. That is a real rewrite of both call sites and a change
  in how a plugin author thinks about options.
- **It helps routes only.** Hooks, service methods and cron handlers are
  closures and always will be. `ctx` stays the bridge for those regardless, so
  this adds a second mechanism rather than replacing one.
- **Codegen work.** Core needs to collect entrypoints and emit static imports;
  a dynamic `import(specifier)` with a runtime variable is not statically
  analysable, which is exactly why Astro takes entrypoints at config time.

## Blast radius if taken

Two packages declare `rawRoutes` — `@astromech/assistant` (`/chat`) and
`@astromech/backups` (`buildBackupRoutes(keep)`). Both capture options in the
closure. Nothing else in the repo is affected.

## The question to answer first

Whether a plugin should be able to import core's runtime at all, or whether
`ctx` being the single bridge is a feature worth the per-capability cost. `0007`
records the argument for one rule with no exceptions; this item is the argument
for the host's own mechanism. They are genuinely in tension and the answer is
not obvious.
