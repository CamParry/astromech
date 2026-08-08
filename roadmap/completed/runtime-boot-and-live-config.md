# Runtime Boot and Live Config

Shipped 2026-08-09. The server now boots itself on the first request, and the
config reaches it as a live module. What follows is the record of the defect and
the work, kept as it was written.

## The defect

The server never booted itself. `initRuntime` was called once, from
`astro:config:setup` in `boot/astro.ts`, which runs in the process that builds the
site. A deployed server is a different process, so the 17 `globalThis` registries
that hook fills are empty at request time.

Verified 2026-08-08, not inferred: `npm run build` in `apps/demo`, then
`PORT=4399 node ./dist/server/entry.mjs`, and every request fails with
`[Astromech] 'dbDriver' is not configured`. `/admin` and `/api/*` return 404 as a
downstream effect of the same thing. `astro dev` hides it completely, because
there the config phase and the SSR runtime share one process, which is what
`utilities/registry.ts` records as an assumption in its own docblock.

The second symptom has the same root. `virtual:astromech/config` is emitted as
`export default ${JSON.stringify(resolvedConfig)}`, so anything carrying
behaviour is destroyed in transit. `{ custom: fn }` has never run under Astro,
and `storage`, `image.driver` and `email.driver` arrive as husks that nothing
reads.

One decision causes both: config crosses the build boundary as data, so live
things need a side channel, and that side channel only works when both sides are
one process.

This item replaces `config-functions-reach-the-server.md`, which described the
serialisation half alone. Its three proposed directions are superseded: (1) and
(2) both register functions at boot, which is the mechanism that does not survive
a build.

## Why this shape

Every CMS whose config holds live objects loads the config file as a module in
the serving process. Payload imports `payload.config.ts` at runtime through a path
alias and serialises nothing, memoising init on `globalThis` by caching the
promise. Keystone compiles to `.keystone/config.js` and `require`s it at runtime.
Strapi and Sanity are the same idea in their own shapes. The systems that
serialise (`@astrojs/db`, Nuxt `runtimeConfig`, `astro:config`) do so because
their config is data by construction, never behaviour. `@astrojs/db` has since
been removed from Astro.

In Astro specifically, `auth-astro` already ships the re-export: its virtual
module is `import authConfig from "${configFile}"; export default authConfig`, and
Auth.js providers and database adapters survive it.

Astro has no runtime hook, by design. Every documented integration hook is
dev-time or build-time; `astro:server:setup` and `astro:server:start` are dev
only. On a request for a production start hook, a maintainer stated the rule:
passing a function is unsafe because the information must be available after a
build and a function is not serialisable, so "usually, we accept a path to an
entry point, load it, and execute it." `addMiddleware({ entrypoint })` is already
that mechanism, and Astromech already uses it.

## What the experiment measured

A throwaway change (live virtual module plus lazy middleware boot), built and
run, then reverted:

- The built server serves real content. `/` went 500 to 200, `/admin` 404 to 200,
  and `/api/*` returned real JSON once authenticated.
- Config evaluations: 1 during build, 1 per serving process, 2 under `astro dev`.
- Memoisation held. Eight concurrent requests fired the instant the port opened
  produced exactly one `initRuntime` call.
- The client bundle stayed clean. The admin SPA reads
  `virtual:astromech/admin-config`, which is JSON and stays JSON.

Two costs surfaced, both addressed below: `import.meta.url` inside the config
changes meaning once the config is bundled, and an optional peer reachable from
the `astromech` barrel becomes a hard build error.

## The design

The integration takes a config **path** rather than an evaluated config object.
It loads that file in Node at config time for what it needs then (route
registration, the admin route `define`, the admin config, codegen), and emits
`virtual:astromech/config` as a re-export of the same path so the SSR graph gets
the live object.

`apps/demo/astro.config.mjs` becomes `astromech()`, defaulting to
`./astromech.config.ts`, with `astromech({ configFile: './elsewhere.ts' })` when
it is not the default.

The file is still evaluated twice, once in Node at config time and once in the
SSR graph. That is unavoidable here and is where Astromech differs from
`auth-astro`, which needs nothing from its config at config time and so never
loads it in Node. Two evaluations are safe only if **exactly one copy is ever
booted**, so the eager `initRuntime` is deleted rather than supplemented, and
drivers must construct lazily so the unbooted copy costs nothing. `libsqlDriver`
already does. In a real build the two evaluations are in different processes and
never coexist; only `astro dev` holds both at once.

Boot moves into the injected middleware, lazily, caching the promise rather than
the result so concurrent first requests share one init. Not module scope:
Cloudflare Workers forbid I/O outside a request context, so a module-scope boot
would pass under Node and throw on Workers. Workers are also per-isolate rather
than per-process, and isolates are evicted, so boot runs repeatedly over a
deployment's life and has to stay cheap.

Migrations and the scheduler do not move into the request path.

## Workstreams

One branch, a commit per workstream.

- [x] **WS1 — Config path API.** `astromech()` accepts `{ configFile }` and
      defaults to `./astromech.config.ts`, resolved against the Astro project
      root. The jiti loading `transport/cli/config.ts` already did moved to
      `boot/config-loader.ts` and both callers share it. `resolveConfig` runs
      inside `astro:config:setup` rather than at factory time, since the load is
      async.
- [x] **WS2 — Live virtual module.** `virtual:astromech/config` re-exports the
      author's module instead of a JSON literal. The default export stays a
      `ResolvedConfig`, and a `rawConfig` named export carries the config as
      written, which `initRuntime` needs. `resolveConfig` gained its own tsup
      entry: the emitted module imports it by absolute path, and the library
      build is otherwise all hashed chunks with no stable filename to point at.
- [x] **WS3 — Lazy boot.** The `initRuntime` call in `astro:config:setup` is
      deleted, and `src/middleware.ts` boots on the first request, memoising the
      promise through the existing `createRegistry` singleton so concurrent
      first requests share one init. Nothing else depended on config-time boot —
      `registerRoutes`, `buildAdminConfig`, `generatePluginClientManifest`,
      `generateClientTypes` and `generateMethodManifest` all take config
      structure as arguments and read no registry. Two things did change:
      `startScheduler` moved into the boot, because it needs the driver
      `initRuntime` registers and the only booted runtime now lives in the
      serving process, and `runMigrations` takes the database explicitly so the
      build hooks can migrate without populating the registries.
- [x] **WS4 — Bundler hygiene.** The general answer is `peerDependenciesMeta`,
      not bundler configuration. Vite stubs an unresolved specifier that the
      importing package declares optional, so declaring `nodemailer` and
      `wrangler` — both guarded at runtime, neither declared — fixes the build on
      its own. `build.rollupOptions.external` was tried and then removed: it is
      redundant, and it bypasses Vite's stub so a missing package surfaces as
      `ERR_MODULE_NOT_FOUND` instead of a message naming the package. Measured by
      pointing the demo at `SmtpDriver`, which is the only way to make the
      failure reachable — the demo's `ConsoleDriver` tree-shakes nodemailer out.
- [x] **WS5 — Config authoring rules.** No paths resolved from `import.meta.url`:
      once bundled it points at the chunk, which silently created an empty
      SQLite file in `dist/server/chunks/` and served 200s over it. The rule is
      that config paths resolve against the working directory and commands run
      from the project root, which is what Astro itself does and what
      `filesystem({ dir: './public/uploads' })` already assumed. The demo's `db`
      became a bare `libsqlDriver()`, which already reads `DATABASE_URL` and
      already falls back to `file:./database.db`, so no new environment variable
      was invented. Landed before WS2 so it is verifiable on its own.
- [x] **WS6 — Delete the workarounds.** The resource-validator registry is gone.
      Every call site was already a registry lookup with the config value as its
      fallback, and that fallback is now simply correct. The `ai` strip stays:
      `decisions/0021` justifies it by the JSON round trip, which no longer
      applies, but it turns out to be load-bearing for a better reason.
      Consumers must reach the model through `getAIConfig()` to get the copy
      `buildAIConfig` wrapped with logging middleware, and `config.ai.model`
      would bypass it. Recorded so nobody removes it as dead weight later.
      Deleting the registry also surfaced a coverage gap that predates this
      work. Resource-level `validate` was tested only through the registry's own
      unit tests, which tested the store rather than the behaviour. Breaking
      each call site in turn and running its suite: entries `create` and
      `update` fail, so they are covered, while **staging-merge, media, users
      and settings-page `validate` have no test that notices at all**. Nothing
      was written to paper over it; the gap belongs with
      `roadmap/planned/field-validation-coverage.md`.

- [x] **WS7 — Documentation.** `ARCHITECTURE.md`'s two-graph section is
      re-derived, and so is the plugin boundary callout in
      `apps/docs/plugins/authoring.md`: the rule survives, the reason is now that
      the config is loaded twice and the plugin has to survive the plain-Node
      one. A claim that a port cannot be wired in `initRuntime` is gone, since
      `initRuntime` now runs in the serving process's Vite graph. The
      known-limitation callout in `apps/docs/content/field-validation.md` is
      deleted outright. `apps/docs/configuration/database.md` gains WS5's rule.
      `decisions/0030-the-server-loads-the-config-as-a-module.md` records the
      why and supersedes 0021's reasoning. One claim was measured rather than
      asserted, because it is load-bearing: a plugin package's module body runs
      **twice** under `astro dev`, with `globalThis` shared and module-level
      state not, so Vite does not reuse the Node-loaded instance for the SSR
      graph. One gap was left open — `apps/docs` has no installation or setup
      page at all, so `astromech({ configFile })` has no user-facing home and is
      documented only in the docblock of `boot/astro.ts`.

## Verification

The gate does not cover any of this. `apps/demo` has no typecheck and nothing in
the suite runs a build.

- [x] `npm run build` in `apps/demo`, run `dist/server/entry.mjs`, and confirm
      `/`, `/admin` and an authenticated `/api/*` read all work. This is the check
      that would have caught the original defect and does not exist today. `/` and
      `/admin` went 500 and 404 to 200, and an authenticated create returned real
      JSON.
- [x] `astro dev` still works. A change that fixes the build and breaks dev is the
      obvious failure mode.
- [x] A `{ custom: fn }` rule actually rejects a bad value, under **both**
      `astro dev` and a built server. Measured by adding an always-failing rule to
      the demo's `category.description`: 422 from both, naming the rule's own
      message.
- [x] Count config evaluations before and after, so a regression to double-boot is
      visible. One per build, one per serving process, two under `astro dev`.
      All of the above was done by hand. Nothing in the gate runs a build, so none of
      it would catch the next regression — carried out to
      `roadmap/planned/gate-runs-a-build.md`.

## What was left open

- The dev double-evaluation is accepted. It is not causing harm: plugin methods,
  a plugin entry type and the admin routes were all exercised under dev after
  the change, and plugin registration survives the two module registries not
  being shared. Splitting the config into build-time knobs and runtime values
  stays available if that changes.
- Whether the CLI and vitest shims (`transport/cli/virtual-config-shim.ts` and
  the vitest alias) still need to exist now the virtual module is live, or
  whether all three paths collapse to one. Untouched here; both still work.
- Where migrations run for a Workers deployment, given there is no build-time
  process holding a filesystem. `runMigrations` now takes a database explicitly,
  which is the shape a Workers caller would need, but no such caller exists.
- `apps/docs` has no installation page, so the config-path API has no
  user-facing home — carried out to `roadmap/planned/docs-installation-page.md`.
