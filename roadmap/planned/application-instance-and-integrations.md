# Application Instance & Integrations Layer

One reorganization of the entry-point layer, done in a single pass on one
branch. `decisions/0057-one-application-instance-thin-framework-integrations.md`
holds the full rationale and the rejected alternatives;
`specs/application-architecture-map.md` holds the diagrams, the field research
behind each choice, and the entry-layer audit this plan closes. This file is
written to be enough on its own: an implementer picking it up cold should not
need the session it came from.

Prerequisite for `roadmap/planned/multi-runtime-and-framework-adapters.md`,
which plans per-framework glue but has no application object for it to plug
into. That file still says "adapter"; reconcile it to "integration" as part of
this work.

## Why, in short

The runtime works but its entry structure grew bottom-up. Four call sites each
boot a different subset of the runtime by hand; the Astro boundary exists in
the import graph but not in the directory tree; and ~35 modules import
`virtual:astromech/config` at module scope, welding them to the one graph where
`virtual:` resolves. That weld is the root cause of the comment sprawl that
started this work — the import comments in `boot/boot.ts`, the "do NOT import
this" headers, the sub-barrel workarounds. Prior art surveyed: Laravel
(bootstrappers, thin entries), Payload (`getPayload`, global-cached promise),
Better Auth (thin per-framework integrations over one handler), Hono (fetch
baseline), Apostrophe, Ghost, Directus, Strapi (boot phases, migration
policy, scheduler placement).

## Order of work

Each block depends on the one before it.

### 1. `src/config/` — the config pipeline gets its own subject

- [ ] Move `boot/config-loader.ts` → `config/load.ts` (jiti loading, unchanged).
- [ ] Split `boot/config-resolver.ts` (16KB, five jobs) into named steps:
      `config/resolve.ts` plus validators for field trees, admin pages,
      qualified relationship targets and media access, and
      `config/public-settings.ts` for the inline derivation block.
- [ ] Move `boot/admin-config.ts` → `config/admin-config.ts` (a projection of
      resolved config for the admin SPA; every integration needs it, so it is
      not Astro glue).
- [ ] Add `config` to the layer table in `.dependency-cruiser.cjs`, above the
      domains — it validates their declarations.
- [ ] The numbered "Step 1…Step 5" comments do not survive the split; the file
      names carry what they said.

### 2. The application instance

- [ ] `getAstromech()` — memoised async factory, the one front door. Resolves
      to `Astromech`: a factory-built object (not a class), holding the domain
      services, the resolved config and the lifecycle.
- [ ] The memo lives on the `globalThis` registry, never a module-level
      variable (tsup emits multiple entry chunks; a module-scoped memo
      duplicates per chunk and boots twice). A **failed boot clears the memo**
      so it is retryable — today's `ensure-booted.ts` caches a rejected
      promise forever.
- [ ] Boot is an ordered, named phase list with per-step timing, not one
      function: **register drivers → register plugins → boot plugins → ready**.
      Names are chosen once and never aliased (Apostrophe's legacy aliases are
      the cautionary tale).
- [ ] **Scheduler start leaves the phases** and becomes the serving entry's
      action. Boot is then full and singular for every caller; the CLI and MCP
      boot fully and simply never start it. Verify at implementation that
      `bootPlugins` side effects are acceptable in short-lived processes.
- [ ] Delete `boot/ensure-booted.ts` (subsumed), the deprecated
      `runScheduledJobs`, the MCP's hand-assembled boot sequence, and
      `assertPluginSourcesReachable` (the guard that existed to catch
      half-booted callers).
- [ ] `runMigrations` → `boot/migrations.ts`, and **narrow its catch** to the
      provider load. A failed `migrateToLatest` currently degrades to a log
      line and lets the dev server or build continue against a stale schema.
- [ ] Add a boot-time migration **drift check**: compare applied against
      available and warn; never mutate. Migrations run only via `db:init` and
      the build/dev hooks (Directus's shape; Ghost's migrate-on-every-boot is
      the counter-example).
- [ ] Registry slots split: **instance state** (db, storage, email, ai, image,
      scheduler, plugin runtime, manifest, config) becomes typed fields;
      **process-global** (ALS request context, cron interval and tick guards,
      `cloudflareEnv`, `uiInstance`, the boot memo) stays on `globalThis`.
- [ ] `generateMethodManifest` returns the structure, not a string — boot
      currently `JSON.parse`s what the generator just serialised. Serialisation
      moves to the edges that write files, under one failure policy.

### 3. Config enters at boot

- [ ] Migrate every module-scope `import config from 'virtual:astromech/config'`
      (~30 sites across entries, media, users, settings, request-context, cron)
      to read from the application's config accessor at call time.
- [ ] The direction that makes this work: `config/` (above the domains)
      _produces_ the resolved config, boot _supplies_ it to a low-level
      registry slot, and every reader takes it from there. `cron/registry.ts`'s
      `setRuntimeConfig`/`getRuntimeConfig` is the existing miniature of this —
      generalise it and move it out of the cron domain.
- [ ] Delete the CLI's parallel config mechanism: `virtual-config-shim.ts` (its
      `rawConfig` is a Proxy that throws on every read; its `set` trap can
      mutate live config) and the `cliConfig` global. The CLI boots the
      instance like everything else.
- [ ] Done when the only `virtual:` importers left are the entry files that
      _supply_ config, and `check:node-imports` passes with `getAstromech`
      exported from the root barrel.

### 4. `integrations/` — the framework and runtime glue

- [ ] `integrations/astro/` — move `boot/astro.ts`, `boot/route-registration.ts`,
      `src/middleware.ts` and the three `routes/*.ts` entrypoints. The Vite
      alias table moves with them.
- [ ] `integrations/cloudflare/` — move `boot/scheduled.ts`. It captures
      `scheduledTime`, gets the app, hands over a tick: the four-move
      integration shape for a runtime rather than a framework. This supersedes
      `decisions/0053-scheduled-entrypoints-live-in-boot.md` on placement while
      keeping its principle (a module belongs to the layer matching what it
      does); an integrations tier did not exist when 0053 was written.
- [ ] Session resolution and `runWithContext` move **out of the middleware into
      the application**, so every integration inherits identical auth and
      request-context behaviour. The Astro middleware shrinks to glue: hand
      over the `Request`, map `context.locals`.
- [ ] Every serving entry calls `getAstromech()` — including the three route
      entrypoints, which today rely on `addMiddleware({ order: 'pre' })` having
      run first, an ordering contract nothing enforces. The memo makes the
      extra call free.
- [ ] Acceptance test for any integration: four moves (capture input, get app,
      hand over, emit result). An integration needing a new branch in core is
      reporting a missing application capability.
- [ ] Published specifiers (`astromech/astro`, `astromech/middleware`,
      `astromech/routes/*`) do not change; update the `exports` map and keep
      `check:exports` green.
- [ ] `defaultScheduler()` stops sniffing `navigator.userAgent` — the
      integration knows its platform and supplies the default. The sniff stays
      only for Cloudflare binding resolution, where no config can answer.

### 5. Drop the transport mirror

- [ ] Delete the shared `AstromechClient` contract. The app's accessor surface
      is primary; the fetch client becomes a standalone typed REST wrapper,
      typed by what the wire actually returns (public shapes by default).
- [ ] `configure({ baseUrl })` moves onto the fetch client, and the local
      no-op implementation is deleted. **A method implemented only to satisfy a
      name means the contract is fighting the implementation and losing.**
- [ ] Wire-surface parity stays the goal, enforced by mechanism rather than by
      interface: the HTTP surface derives from the same services (method
      manifest → dispatch), and specific guarantees get a parity test, as
      `decisions/0056-better-auth-owns-the-users-format-not-its-ddl.md` did.
- [ ] "Local" leaves the vocabulary — no local/remote pair remains. The
      `astromech/local` subpath retires and `getAstromech` ships from the root
      `astromech` barrel.
- [ ] `transport/local/index.ts` loses its module-scope `setPluginClient` /
      `setPluginMethods` side effects (they move into the boot lifecycle),
      which makes the package's `"sideEffects": false` declaration true again.
      The plugin-runtime ↔ local import cycle they dodge needs an explicit
      port, not an import order.
- [ ] Plugins keep receiving the `ctx` surface, never the app itself — nothing
      hands a plugin `destroy()`.

### 6. Moves, renames and the comment pass

- [ ] `boot/relationship-index.ts`, `boot/validate-stored-content.ts` and
      `boot/plugin-sources.ts` → `transport/cli/`, beside the only two commands
      that call them. They were in `boot/` for a cross-domain constraint that
      no longer exists — `.dependency-cruiser.cjs` now states domains are peers
      and may read one another. **Fix the stale header in
      `relationship-index.ts` that still asserts the old rule.**
- [ ] Renames: `wireEntryAccess` / `wireNotifyAccess` → `setX`, matching the
      registry setters beside them ("wire" means the transport in this
      ecosystem — wire format, `decisions/0013-chat-transcript-as-content-blocks.md`);
      `resolveSessionUser` → the `getSession` shape (Better Auth's vocabulary).
      `resolveConfig` / `ResolvedConfig` stay — Vite's own API.
- [ ] Naming audit on the touched files: `cfg` → `entryType` (the `code` skill
      bans the abbreviation), one verb for one operation (`toResolvedX` beside
      `resolveX` in the same file), sentence-style file headers throughout
      (three files still use Title Case labels), `pkgSrc` and `mod` spelled
      out. "Resolve" outside config resolution must beat a plainer verb.
- [ ] Tidiness on the touched files: the dynamic re-import of `fileURLToPath`
      in `boot/astro.ts` (already imported statically), a `virtualModule(name,
    load)` helper for the three identical Vite virtual-module plugins (~30
      lines), one hoisted `plugins` local for the four `config.plugins ?? []`
      repeats, and the `@param` JSDoc that restates its own types in
      `route-registration.ts`.
- [ ] Comment pass per restructured module, as the acceptance bar: every
      comment over the `code` skill's three-line budget is deleted as
      redundant, compressed to a pointer at `ARCHITECTURE.md` (environment
      facts — platform limits, module-graph physics), or raised as an
      unresolved design question. **A comment may explain the environment;
      it may never defend the design.** A comment citing a constraint gets
      checked against the enforced constraint — a stale one reads exactly
      like a live one, which is what produced the `boot/` misfiling above.

### 7. Docs and the gate

- [ ] `ARCHITECTURE.md` — layer table and directory map (new `config/`,
      `integrations/`, the boot layer's narrowed meaning).
- [ ] `TERMINOLOGY.md` — entries for "application" and "integration"; remove
      "local API".
- [ ] Reconcile `roadmap/planned/multi-runtime-and-framework-adapters.md` to
      the integration vocabulary.
- [ ] Full gate plus `check:boot`, `check:config`, `check:node-imports`,
      `check:exports`, `lint:deps`; `db:generate` reports no schema changes.

## Constraints that must survive the refactor

- The memo lives on `globalThis` (tsup multi-chunk duplication).
- Request-scoped state never lives on the instance — `request-context/`
  (AsyncLocalStorage) carries it. Workers isolates, Node processes and dev HMR
  all reuse one instance across many requests; Laravel needed Octane's
  clone-per-request sandbox to retrofit this, and we avoid needing it.
- Construction must not arm behaviour: no timers, no I/O on import. Directus
  starts schedules inside `createApp()`, so importing its app starts timers.
- The core exposes a request handler, not a server. Precondition failures
  throw typed errors the integration renders; never `process.exit`.
- The per-domain registries stay underneath the instance. This is a front
  door and a lifecycle, not a dependency-injection rework — Payload and
  Laravel both keep container access ambient.
- Two processes, not one: the config-time process (plain Node, `astro dev` /
  `astro build`) cannot resolve `virtual:`; only the serving process boots.
  It gets no application object — an app that can never start would be a lie.

## Decide during implementation

- **Q8 — the `exports` dev-condition trap.** Six subpaths resolve `types` from
  `dist` and `default` from `src`, so a source edit is live while its types are
  whatever the last build emitted (this produced phantom errors in the session
  that planned this work, and `check:exports` compares key sets, not
  conditions). Agreed fix, pending feasibility: give the `src/exports/*` shims
  relative imports instead of `@/`, then point `types` at `src` too. Plugin
  tsconfigs clear `paths`, which is why the `@/` imports fail there.
- **Q9 — module-scope `let` singletons.** `users/auth.ts` holds `let _auth` at
  module scope, exactly the pattern `utilities/registry.ts` declares unsafe
  across tsup chunks. Either a latent double-instantiation bug or the premise
  is overstated for SSR-graph-only modules. Investigate once, then state the
  rule for when a module-scope singleton is permitted.

## Known gaps, deferred by decision

- **No `destroy()` / teardown on the instance.** Every mature system grew one
  (Apostrophe's `apos.destroy()`, Strapi's `destroy()`); ours arrives when a
  real consumer needs it — test isolation or an HMR rebuild — designed then
  against the registries that exist then.
- **`.dependency-cruiser.cjs` stays.** It did not force any of this
  reorganization and it has caught real defects (0053's upward edges; the
  browser-boundary rules that keep the config virtual module out of the admin
  bundle). Peer projects do not use it, so revisit if it starts blocking work;
  the signal to watch is its exemption list growing (`NO_UPWARD_EXEMPT` for
  `cli`/`tools`/`mcp`, plus four hand-written carve-outs), because
  accumulating exceptions mean a rule has begun describing the code instead of
  shaping it.
