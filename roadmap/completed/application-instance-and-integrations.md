# Application Instance & Integrations Layer

One reorganization of the entry-point layer, shipped in small staged commits.
`decisions/0057-one-application-instance-thin-framework-integrations.md` holds
the original rationale and the rejected alternatives;
`decisions/0063-what-the-application-reorganization-changed.md` records where the
work landed differently from it. The design spec held the target tree and every
new file's signatures, and was deleted on ship (stage 14).

Prerequisite for `roadmap/planned/multi-runtime-and-framework-integrations.md`,
which plans per-framework glue on the application object this work created.

## Why, in short

The runtime works but its entry structure grew bottom-up. Four call sites each
boot a different subset by hand; the Astro boundary exists in the import graph
but not in the directory tree; and ~30 modules import
`virtual:astromech/config` at module scope, welding them to the one graph where
`virtual:` resolves. That weld is the root cause of the comment sprawl that
started this work.

## Rules that apply to every stage

These are the habits this work exists to remove. A stage that reintroduces one
has failed even if the gate is green.

- **A comment may explain the environment; it may never defend the design.**
  Platform limits and module-graph physics are fair. A comment justifying a
  placement is a flag to rethink the placement. Every comment over the `code`
  skill's three-line budget is deleted, compressed to a pointer, or raised as an
  unresolved question.
- **A comment citing a constraint gets checked against the enforced
  constraint.** A stale one reads exactly like a live one. That is precisely how
  the maintenance passes stayed misfiled in `boot/` after the rule that put them
  there was relaxed.
- **Nothing reads config at module scope.** `const c = getConfig()` at the top of
  a module is the same weld in a new coat. Read at call time.
- **Nothing request-scoped goes on the instance.** It travels through
  `request-context/`.
- **No new `globalThis` slot without a reason that names the tsup chunk
  problem.** Instance state becomes typed fields; only process-global state
  (the ALS store, cron guards, `cloudflareEnv`, `uiInstance`, the instance slot)
  stays on the global.
- **Construction arms nothing.** No timers, no I/O at import.
- **Never `--no-verify`.** Run the gate, including `check:boot`, which the
  pre-commit hook does not.
- Work in a worktree at `../Astromech-worktrees/<branch>`, with `pnpm install`,
  a copy of `apps/demo/.env`, and its own `pnpm run build`.

## Where this landed

All fourteen stages shipped to `main`. Two things learned the expensive way,
worth carrying into the follow-on integration work:

- **`check:boot` is not optional, and it is the slow one.** Stage 3 passed nine
  gate checks on a build whose homepage hung: a module-scope config read threw
  during module evaluation, and the node adapter answered the rejection by
  holding the socket open. Only `check:boot` requests a page, so only
  `check:boot` saw it. Budget minutes for it and do not read slowness as failure.
- **A comment asserting a constraint has to be tested, not reasoned.** A static
  import in `boot/application.ts` was reverted, and a comment written claiming it
  deadlocked the SSR server, on inference alone. Rebuilding proved the import
  fine and the real cause elsewhere. The false comment was the more expensive
  artefact — it reads exactly like a live constraint.

## Stage order

Each stage is one commit and should land green on its own. The dependency chain
is 1 → 2 → 3, then 4 → 5, after which 6, 7, 8, 9, 10, 11 and 12 are independent
of each other and can land in any order. 13 and 14 come last.

| #   | Stage                                | Depends on                  |
| --- | ------------------------------------ | --------------------------- |
| 1   | `src/config/`                        | —                           |
| 2   | The application instance             | 1                           |
| 3   | Config enters at boot                | 2                           |
| 4   | `basePath`                           | 3                           |
| 5   | Hono builds at boot, and `app.fetch` | 4                           |
| 6   | Better Auth into Hono                | 5                           |
| 7   | Media into Hono                      | 5                           |
| 8   | `integrations/astro/`                | 5 (6 and 7 first if landed) |
| 9   | `integrations/cloudflare/`           | 3                           |
| 10  | The `exports` dev-condition trap     | 8                           |
| 11  | Lazy identity                        | 5                           |
| 12  | Drop the transport mirror            | 5                           |
| 13  | Moves, renames and the comment pass  | all                         |
| 14  | Docs and the gate                    | all                         |

## Stage 1 — `src/config/`

- [x] **First, settle the six symbol moves.** `config/` can only sit in the
      capabilities layer once `BUILT_IN_SUPPORTS`, `parseEntryTypeId`,
      `resolveEntryType`, `CLOUDFLARE_IMAGES_DRIVER`, `normaliseWidths` and
      `defaultImageWidths` move down to leaves. The spec's table proposes homes
      but **read the modules rather than trusting it**; if any carries a real
      domain dependency, the placement of `config/` is wrong and has to be
      revisited before anything else in this stage.
- [x] Move `boot/config-loader.ts` → `config/load.ts` (jiti loading, unchanged).
- [x] Split `boot/config-resolver.ts` (16KB, five jobs) into the named steps in
      the spec's tree. `config/resolve.ts` orchestrates and nothing else.
- [x] Move `boot/admin-config.ts` → `config/admin-config.ts`.
- [x] `config/registry.ts` — `setConfig` / `getConfig`, the same shape as
      `database/registry.ts`.
- [x] Compute the role map once during resolution and hold it on
      `ResolvedConfig`. This is what removes the reason `RequestContext` carries
      a derived `Role`. Do **not** change the fail-open fallback here; that is
      `roadmap/planned/role-resolution-fails-open.md`.
- [x] Add `config` to `LAYERS` in `.dependency-cruiser.cjs`, in the capabilities
      tier.

**Cautions.** A move and a split, not a rewrite: no behaviour changes, no
validation "improvements" smuggled in. The "Step 1…Step 5" comments do not
survive; the file names carry what they said. `dist/boot/config-resolver.js` is
written as an absolute path into the generated virtual config module, so its
tsup entry key and that path change together, and `check:boot` is the only thing
that catches a mismatch.

## Stage 2 — The application instance

- [x] `boot/application.ts` — `createAstromech({ config })` and `getAstromech()`
      to the spec's signatures. Factory-built object, not a class.
- [x] `boot/lifecycle.ts` — the ordered named phases with per-step timing:
      resolve config → register drivers → register plugins → boot plugins →
      ready. Names chosen once, no aliases ever.
- [x] The instance slot lives on the `globalThis` registry, filled
      **synchronously** with the in-flight promise before the first await. A
      failed boot clears it so it is retryable; today's `ensure-booted.ts` caches
      a rejected promise forever.
- [x] **Verify the virtual config module resolves to one instance across tsup
      chunks.** The "different config throws" guard compares object identity. If
      identity proves unreliable, the guard reuses silently and the reason gets
      recorded rather than left as a mystery.
- [x] `boot/migrations.ts` — `runMigrations` with its **catch narrowed to the
      provider load**. A failed `migrateToLatest` currently degrades to a log
      line and lets the dev server or build continue against a stale schema.
- [x] Add a boot-time migration drift check: compare applied against available
      and warn, never mutate.
- [x] `app.startScheduler()` leaves the phase list and becomes the serving
      integration's action. Verify `bootPlugins` side effects are acceptable in
      short-lived processes, since the CLI and MCP now run it.
- [x] `generateMethodManifest` returns the structure, not a string. Boot
      currently `JSON.parse`s what the generator just serialised; serialisation
      moves to the two edges that write files, under one failure policy.
- [x] Registry slots split. As written this said every registry (db, storage,
      email, ai, image, scheduler, plugin runtime, manifest, config) becomes a
      typed field on the instance, which contradicts the spec's constraint that
      the per-domain registries stay **underneath** the instance. The spec wins
      by its own precedence rule, and it is also the right answer: `getDb()` as
      an instance field puts `await getAstromech()` in every storage call site,
      which is the dependency-injection rework the constraint forbids. Done as:
      no new untyped global (net −1), the new slot typed, and `config` a typed
      field on the instance.
- [x] Delete `boot/ensure-booted.ts`, the deprecated `runScheduledJobs`, the
      MCP's hand-assembled boot sequence, and `boot/plugin-sources.ts` with
      `assertPluginSourcesReachable` (the guard existed to catch half-booted
      callers, and boot is now one sequence).

**Cautions.** `getAstromech()` must not self-boot: two functions that both
initialise are two front doors, which is the disease this work exists to cure.
No `destroy()` — a recorded gap, not an oversight. Do not add a "booted yet?"
branch to any accessor; if one seems necessary, the create/get split has been
broken.

## Stage 3 — Config enters at boot

- [x] Migrate every module-scope `import config from 'virtual:astromech/config'`
      (~30 sites across entries, media, users, settings, request-context, cron)
      to `getConfig()` at call time.
- [x] Delete `transport/cli/virtual-config-shim.ts` (its `rawConfig` is a Proxy
      that throws on every read; its `set` trap can mutate live config) and the
      `cliConfig` global. The CLI and MCP call `createAstromech({ config })`
      like everything else.
- [x] Delete the `virtual:astromech/config` alias in `tsup.config.ts`'s CLI
      build and in `vitest.config.ts`. **The test harness moves to `setConfig()`**;
      expect a wide test-fixture diff, since the vitest alias is currently how
      every test reaches config.
- [x] Delete `setRuntimeConfig` / `getRuntimeConfig` from `cron/registry.ts`.
- [x] Export `getAstromech` and `createAstromech` from the root barrel.
- [x] Q9 — `users/auth.ts`'s module-scope `let _auth` and its lazy `Proxy` are
      replaced by an optional registry slot that `getAuth()` fills on first ask.
      The rule, now in `ARCHITECTURE.md`, admits no exception: process-wide
      state lives in a registry slot, memoised values included.
- [x] Close the split-brain stage 2 opened: the virtual module computes its own
      `resolveConfig(rawConfig)` eagerly and the `resolve config` phase computes
      another, so a serving process holds two structurally identical
      `ResolvedConfig` objects. Migrating the readers deletes the first. Nothing
      compares one by identity today, which is the only reason it is survivable.
- [x] Drop the lazy `import('@/transport/local/index')` in `boot/application.ts`
      and its four-line comment. It is dynamic only because that module imports
      `virtual:` at module scope; this stage removes the cause.
- [x] Done when the only `virtual:` importers left are the entry files that
      supply config, and `check:node-imports` passes.

**Cautions.** The whole test suite depends on the vitest alias, so this stage
looks catastrophic in the middle and must not be abandoned halfway. Watch the
browser-boundary rules: `media/serving/image/Image.astro` imports config and
sits in the SSR graph, so confirm what still needs the virtual module's default
export once the migration is done.

## Stage 4 — `basePath`

A config-shape change only. No files move.

- [x] `basePath` replaces `adminRoute` and `apiRoute` in `AstromechConfig` and
      `ResolvedConfig`. Admin at `${basePath}`, API at `${basePath}/api`, both
      derived rather than configured. Default `/cms`.
- [x] `mediaRoute` is unchanged and keeps its underscore. The spec records why
      media stays on its own top-level prefix.
- [x] Update `boot/route-registration.ts`, the admin's `__ASTROMECH_ADMIN_ROUTE__`
      / `__ASTROMECH_API_ROUTE__` defines, and anything reading either key.
- [x] Update `apps/demo` and `apps/docs`.

**Cautions.** This lands before the Hono rebuild deliberately, so stage 5
registers routes against the final shape instead of being rewritten. It is a
breaking config change, so `check:config` and `check:boot` both matter here.

## Stage 5 — Hono builds at boot, and `app.fetch`

The behavioural core of the HTTP work. Files stay where they are.

- [x] `transport/http/index.ts` exports `createHttpApp(config): OpenAPIHono`
      instead of a module-scope `export const app`. Routes register at their
      **real absolute paths** from the resolved config.
- [x] The per-request `Astromech.config` reads inside its middlewares become
      construction-time values, since config now exists when the app is built.
- [x] `app.fetch(request)` on the instance. Built in `boot()` from the resolved
      config the phases return, not as a phase of its own in `lifecycle.ts`.
- [x] The Astro entrypoint loses the URL surgery and becomes one line. It stays
      in `src/routes/` for now; stage 8 moves it. Stage 7 renamed it to
      `src/routes/handler.ts` when media started pointing at it too.

**Cautions.** This is the stage that makes the surgery deletable. Moving the
route file without this just relocates the smell, which is why the move is a
later stage and not this one. Do not add a `basePath()` call to Hono; absolute
path registration is what makes the two-prefix case (API and media) work without
a special case.

## Stage 6 — Better Auth into Hono

- [x] Mount the Better Auth catch-all inside the Hono app at
      `${basePath}/api/auth/*`, delegating to `auth.handler(c.req.raw)`.
- [x] Delete the separately injected auth route and, with it, the requirement
      that it be registered **before** the API catch-all — an ordering contract
      nothing enforces today.

**Cautions.** Catch-all mount, not hand-declared routes: Better Auth owns its
own surface (`decisions/0056-better-auth-owns-the-users-format-not-its-ddl.md`),
and hand-declaring means tracking its route list by hand for OpenAPI coverage
nobody has asked for.

## Stage 7 — Media into Hono

Independent of stage 6.

- [x] Mount media inside the Hono app at `${mediaRoute}/*` so `app.fetch` is
      genuinely one terminal handler and media inherits access control and
      headers.
- [x] Delete the separately injected media route handler.

**Cautions.** Media serving reads no identity today. Bringing it inside the Hono
app must not silently attach `requireAuth` to it. Verify range requests, ETags
and streaming still work through the Hono response path.

## Stage 8 — `integrations/astro/`

Mostly a relocation, which is why it comes after the behavioural stages.

- [x] Move `boot/astro.ts`, split into `index.ts`, `vite.ts` and `routes.ts`.
- [x] Move `boot/route-registration.ts` → `integrations/astro/routes.ts`.
- [x] Move `src/middleware.ts` → `integrations/astro/middleware.ts`.
- [x] Move `src/routes/handler.ts` → `integrations/astro/handler.ts`. Stages 5,
      6 and 7 already collapsed the three entrypoints into this one, so what is
      left here is the move.
- [x] Update the `exports` map and the tsup entry keys together; published
      specifiers do not change. Keep `check:exports` green.
- [x] Remove `routes` from `LAYERS`, add `integrations`.
- [x] Tidiness on the touched files: the dynamic re-import of `fileURLToPath`
      (already imported statically), a `virtualModule(name, load)` helper for the
      three identical Vite virtual-module plugins, one hoisted `plugins` local
      for the four `config.plugins ?? []` repeats, and the `@param` JSDoc that
      restates its own types in `route-registration.ts`.

**Cautions.** `pkgSrc` is what breaks here: the integration computes it from its
own `import.meta.url`, and the built output moves from `dist/boot/astro.js` to
`dist/integrations/astro/index.js`, one level deeper, so the number of `..`
segments changes with it. `check:boot` after this commit, without exception.
Stage 1 removed the other half of this landmine: the generated
`virtual:astromech/config` module now only re-exports the site's own config file
and writes no path into `dist/`.

## Stage 9 — `integrations/cloudflare/`

Depends only on stage 3. Can land any time after it.

- [x] `integrations/cloudflare/index.ts` — `createWorkerEntry(astroEntry)`
      returning `{ fetch, scheduled }`, replacing `boot/scheduled.ts` and the
      hand-written `scheduled()` boilerplate the current setup asks of site
      authors.
- [x] `defaultScheduler()` stops sniffing `navigator.userAgent`; the integration
      supplies the default, through a `setDefaultScheduler` slot in
      `cron/registry.ts`. The sniff stays only for Cloudflare binding
      resolution, where no config can answer.
- [x] Nothing to update in `apps/demo`: it deploys on `@astrojs/node` and has no
      worker entry. This stage therefore has no `check:boot` coverage — the boot
      check only proves the Node scheduler path still resolves `interval()`.
- [x] This supersedes `decisions/0053-scheduled-entrypoints-live-in-boot.md` on
      placement while keeping its principle —
      `decisions/0059-the-worker-entry-is-a-cloudflare-integration.md`.

**Cautions.** The acceptance test for an integration is four moves: capture the
input, get the app, hand it over, emit the result. An integration needing a new
branch in core is reporting a missing application capability, not a reason to
grow.

## Stage 10 — The `exports` dev-condition trap (Q8)

Independent investigation and fix. Nothing else depends on it.

- [x] Six subpaths resolved `types` from `dist` and `default` from `src`, so a
      source edit was live while its types were whatever the last build emitted.
      `check:exports` compared key sets, not conditions, so it could not see it.
- [x] The fix this file proposed — relative specifiers in the `src/exports/*`
      shims, then `types` at `src` — was measured and dropped. It moves the `@/`
      failures one hop deeper into `src/admin/components/**`, where they escape
      `admin/` at once. De-aliasing the graph those subpaths reach is 825 `@/`
      specifiers across 257 files, and Node subpath imports (the one mechanism
      that resolves for a consumer whose tsconfig clears `paths`) need `.js`
      suffixes, so 1298 specifiers.
      `decisions/0060-exports-conditions-agree-within-an-entry.md` records all
      three.
- [x] Instead, conditions within an entry now agree. `./ui`, `./ui/fields`,
      `./ui/layout` and `./ui/app` point both conditions at `dist`, matching
      their `publishConfig` entries — `src/integrations/astro/vite.ts` aliases
      all four to package source, so no host Vite graph reads the map for them.
      `./middleware` becomes a bare string at `src`: nothing imports it as a
      module, so it has no type surface to state.
- [x] `check:exports` compares conditions within an entry, both `dist/` or both
      `src/`, over both maps. It never compares across the maps — `src` here and
      `dist` on npm is the point of the two-map design.
- [x] `./local` was deliberately left mixed, with a named exemption in the check.
      It is the one subpath the trap has actually bitten, and stage 12 deleted
      it; the exemption went with it.

## Stage 11 — Lazy identity

Depends only on stage 5.

- [x] `RequestContext` becomes `{ request, user?, role? }`. The store holds the
      request; identity resolves on first ask and caches for that request. The
      `role?` field is the stopgap `specs/application-architecture-map.md`
      already names: one resolve returns both, and it goes away when the role map
      is computed during config resolution.
- [x] `getCurrentUser()` and `getCurrentRole()` become async — 17
      `getCurrentUser` and 2 `getCurrentRole` call sites across 17 files, not the
      21 across 18 this file claimed. Three of them were not already inside async
      functions: `PluginContext.role`'s synchronous getter, `sessionInput` in
      `policies/scoped-services.ts`, and `currentUserId` in
      `transport/local/notifications.ts`.
- [x] Collapse the four independent session resolvers (Astro middleware, Hono's
      `requireAuth`, Hono's `optionalAuth`, the cron poke route) into one. Their
      "has someone already done this?" branches get **deleted**, not relocated.
      What replaces them is a scope, not a resolver: the Astro middleware and
      `createHttpApp`'s root middleware both call `runWithRequest`, because
      `Astromech.fetch` is a public entry point and may not require an ambient
      store.
- [x] The Astro middleware stops writing `Astro.locals` entirely, and
      `src/env.d.ts` stops declaring `App.Locals`. Nothing reads either, and the
      declaration merge breaks any host site that declares its own `user`. The
      file survives holding only its `astro/client` reference, which is what
      types the `import.meta.env` reads across `src/`.
- [x] `resolveSessionUser` → `getSession` (Better Auth's vocabulary).
- [x] `Astromech` gains `getCurrentUser()` and `getCurrentRole()`. With
      `Astro.locals` gone, a host `.astro` page has no other path to identity.

**Cautions.** Do not solve draft visibility by blanking the user.
`entries/operations/query.ts` already has `VisibilityShape`, `applyVisibility`
and `markPublic`; whatever a host page should see by default is decided at that
seam. It did not come up while this stage landed.

`decisions/0061-identity-resolves-on-demand.md` records the plugin-context
decision (an eager `role` parameter over a promised `ctx.role`, which would
break every plugin) and the `scopeMethods` invariant that survived it.

## Stage 12 — Drop the transport mirror

Depends only on stage 5.

- [x] Delete the shared `AstromechClient` contract. The app's surface is
      primary; the fetch client becomes a standalone typed REST wrapper, typed
      by what the wire actually returns.
- [x] `configure({ baseUrl })` is the fetch client's alone and the local no-op
      is deleted. **A method implemented only to satisfy a name means the
      contract is fighting the implementation and losing.** The never-assigned
      `config: null as unknown as ResolvedConfig` on the fetch client went with
      it — the second member the contract forced.
- [x] `transport/local/index.ts` dissolves into the instance, losing its
      module-scope `setPluginClient` / `setPluginMethods` side effects. The
      plugin-runtime ↔ local import cycle they dodge needs an **explicit port**,
      not an import order — `boot/plugin-access.ts`, called from
      `boot/lifecycle.ts` beside the other two wires. This does **not** make
      `"sideEffects": false` true, as this line originally claimed: the admin
      registries, the HTTP routers and `transport/cli/index.ts`'s `runMain` are
      all still module-scope effects. What it removes is the plugin runtime's
      dependence on one.
- [x] The `astromech/local` subpath retires, now that the code behind it is
      gone. "Local" leaves the vocabulary; no local/remote pair remains.
      `TERMINOLOGY.md` never had an entry for it.
- [x] Plugins keep receiving the `ctx` surface, never the app itself.
      `boot/plugin-access.ts` injects `ClientAccess`'s six handles as a literal;
      the instance would have carried `config` (live drivers), `fetch`,
      `scheduled` and `startScheduler`. (There is no `destroy()` on the app, as
      this line originally said — those four are what leaking it would hand
      over.)

**Cautions.** Wire parity is enforced by mechanism, not by a shared interface:
the HTTP surface derives from the same services (method manifest → dispatch),
and a specific guarantee gets a parity test, as
`decisions/0056-better-auth-owns-the-users-format-not-its-ddl.md` did. Do not
re-derive the fetch client's types from the service types; the transports
genuinely differ (local returns full rows, the wire returns public projections).

`decisions/0062-the-app-is-the-surface-not-a-shared-contract.md` records the
result.

## Stage 13 — Moves, renames and the comment pass

- [x] `boot/relationship-index.ts` and `boot/validate-stored-content.ts` →
      `transport/cli/`, beside the only commands that call them. **Fix the stale
      header in `relationship-index.ts`** that still asserts a cross-domain rule
      `.dependency-cruiser.cjs` reversed.
- [x] Renames per the spec's table: `wireEntryAccess` / `wireNotifyAccess` →
      `setX`, `cfg` → `entryType`, `pkgSrc` and `mod` spelled out.
- [x] Sentence-style file headers throughout (three files still use Title Case
      labels). One verb for one operation (`toResolvedX` beside `resolveX` in
      the same file).
- [x] Comment pass per restructured module, as the acceptance bar for the whole
      work. See the rules at the top of this file.

## Stage 14 — Docs and the gate

- [x] `ARCHITECTURE.md` — the `integrations/` layer. `config/`, the narrowed
      boot layer, the moved leaf symbols and the read-config-at-call-time
      invariant went in as stages 1–3 landed, because that file is a map of the
      present and cannot wait for stage 14.
- [x] `TERMINOLOGY.md` — an entry for "integration". "Application" is written;
      "local API" never appeared in the file.
- [x] A decision record for what this work changed against 0057:
      `decisions/0063-what-the-application-reorganization-changed.md`.
- [x] Reconcile `roadmap/planned/multi-runtime-and-framework-integrations.md` to
      the integration vocabulary (renamed from `-adapters.md`).
- [x] `apps/docs` — the `basePath` config change went in with stage 4.
- [x] Delete the design spec.
- [x] Full gate plus `check:boot`, `check:config`, `check:node-imports`,
      `check:exports`, `lint:deps`; `db:generate` reports no schema changes.

## Follow-ups this work creates

- `roadmap/planned/role-resolution-fails-open.md` — filed, not in scope.
- Default visibility shape for host-page queries, if stage 11 does not settle it.
- `roadmap/planned/media-serving-responses.md` — filed, not in scope. Stage 7
  put media behind the app's middleware and error handling, so the serving route
  now answers with API error envelopes, carries
  `Cross-Origin-Resource-Policy: same-origin`, and still accepts every method.
- **Nothing checks the served OpenAPI document.** Since stage 5 the real app
  registers at absolute paths, so `app.doc` emits `${basePath}/api/...` keys,
  while `tests/transport/http/routes/openapi-document.test.ts` composes its own
  five-router app at bare paths and asserts against those. Neither is wrong, but
  no test compares the document the app actually serves with anything, so the
  served spec can drift silently. Worth a parity check against the method
  manifest rather than a second hand-written expectation.
