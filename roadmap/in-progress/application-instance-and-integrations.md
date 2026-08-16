# Application Instance & Integrations Layer

One reorganization of the entry-point layer, on one branch, in small staged
commits. `decisions/0057-one-application-instance-thin-framework-integrations.md`
holds the rationale and the rejected alternatives.
`specs/application-architecture-map.md` holds the target tree, every new file
with its signatures, and the list of places this work supersedes 0057. **Read
the spec before starting any stage** — it is the contract each stage is built
against, and several of its decisions reverse what 0057 says.

Prerequisite for `roadmap/planned/multi-runtime-and-framework-adapters.md`,
which plans per-framework glue but has no application object for it to plug
into. That file still says "adapter"; reconcile it to "integration" as part of
this work.

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

## Where this stands

Stages 1, 2 and 3 are on `main`. **Stage 4 is next and is unblocked.** One item
inside stage 3 is outstanding and is left ticked-off-able rather than ticked:
Q9, the module-scope `let _auth` in `users/auth.ts`, was never investigated and
no rule was stated for when a module-scope singleton is permitted.

Two things learned the expensive way, both worth carrying into every remaining
stage:

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
- [ ] Investigate Q9 (`users/auth.ts`'s module-scope `let _auth`) while in the
      file, and state the rule for when a module-scope singleton is permitted.
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

- [ ] `basePath` replaces `adminRoute` and `apiRoute` in `AstromechConfig` and
      `ResolvedConfig`. Admin at `${basePath}`, API at `${basePath}/api`, both
      derived rather than configured. Default `/cms`.
- [ ] `mediaRoute` is unchanged and keeps its underscore. The spec records why
      media stays on its own top-level prefix.
- [ ] Update `boot/route-registration.ts`, the admin's `__ASTROMECH_ADMIN_ROUTE__`
      / `__ASTROMECH_API_ROUTE__` defines, and anything reading either key.
- [ ] Update `apps/demo` and `apps/docs`.

**Cautions.** This lands before the Hono rebuild deliberately, so stage 5
registers routes against the final shape instead of being rewritten. It is a
breaking config change, so `check:config` and `check:boot` both matter here.

## Stage 5 — Hono builds at boot, and `app.fetch`

The behavioural core of the HTTP work. Files stay where they are.

- [ ] `transport/http/index.ts` exports `createHttpApp(config): OpenAPIHono`
      instead of a module-scope `export const app`. Routes register at their
      **real absolute paths** from the resolved config.
- [ ] The per-request `Astromech.config` reads inside its middlewares become
      construction-time values, since config now exists when the app is built.
- [ ] `app.fetch(request)` on the instance, wired in the boot lifecycle.
- [ ] `src/routes/api.ts` loses the URL surgery and becomes one line. It stays
      in `src/routes/` for now; stage 8 moves it.

**Cautions.** This is the stage that makes the surgery deletable. Moving the
route file without this just relocates the smell, which is why the move is a
later stage and not this one. Do not add a `basePath()` call to Hono; absolute
path registration is what makes the two-prefix case (API and media) work without
a special case.

## Stage 6 — Better Auth into Hono

- [ ] Mount the Better Auth catch-all inside the Hono app at
      `${basePath}/api/auth/*`, delegating to `auth.handler(c.req.raw)`.
- [ ] Delete the separately injected auth route and, with it, the requirement
      that it be registered **before** the API catch-all — an ordering contract
      nothing enforces today.

**Cautions.** Catch-all mount, not hand-declared routes: Better Auth owns its
own surface (`decisions/0056-better-auth-owns-the-users-format-not-its-ddl.md`),
and hand-declaring means tracking its route list by hand for OpenAPI coverage
nobody has asked for.

## Stage 7 — Media into Hono

Independent of stage 6.

- [ ] Mount media inside the Hono app at `${mediaRoute}/*` so `app.fetch` is
      genuinely one terminal handler and media inherits access control and
      headers.
- [ ] Delete the separately injected media route handler.

**Cautions.** Media serving reads no identity today. Bringing it inside the Hono
app must not silently attach `requireAuth` to it. Verify range requests, ETags
and streaming still work through the Hono response path.

## Stage 8 — `integrations/astro/`

Mostly a relocation, which is why it comes after the behavioural stages.

- [ ] Move `boot/astro.ts`, split into `index.ts`, `vite.ts` and `routes.ts`.
- [ ] Move `boot/route-registration.ts` → `integrations/astro/routes.ts`.
- [ ] Move `src/middleware.ts` → `integrations/astro/middleware.ts`.
- [ ] The three `src/routes/*.ts` entrypoints collapse into one
      `integrations/astro/handler.ts`. Stages 5, 6 and 7 are what make this a
      collapse rather than a rewrite.
- [ ] Update the `exports` map and the tsup entry keys together; published
      specifiers do not change. Keep `check:exports` green.
- [ ] Remove `routes` from `LAYERS`, add `integrations`.
- [ ] Tidiness on the touched files: the dynamic re-import of `fileURLToPath`
      (already imported statically), a `virtualModule(name, load)` helper for the
      three identical Vite virtual-module plugins, one hoisted `plugins` local
      for the four `config.plugins ?? []` repeats, and the `@param` JSDoc that
      restates its own types in `route-registration.ts`.

**Cautions.** `dist/boot/config-resolver.js`'s absolute path breaks here for the
second time in this work, because the integration module that computes it
relative to its own `import.meta.url` has moved. `check:boot` after this commit,
without exception.

## Stage 9 — `integrations/cloudflare/`

Depends only on stage 3. Can land any time after it.

- [ ] `integrations/cloudflare/index.ts` — `createWorkerEntry(astroEntry)`
      returning `{ fetch, scheduled }`, replacing `boot/scheduled.ts` and the
      hand-written `scheduled()` boilerplate the current setup asks of site
      authors.
- [ ] `defaultScheduler()` stops sniffing `navigator.userAgent`; the integration
      supplies the default. The sniff stays only for Cloudflare binding
      resolution, where no config can answer.
- [ ] Update `apps/demo`'s worker entry.
- [ ] This supersedes `decisions/0053-scheduled-entrypoints-live-in-boot.md` on
      placement while keeping its principle.

**Cautions.** The acceptance test for an integration is four moves: capture the
input, get the app, hand it over, emit the result. An integration needing a new
branch in core is reporting a missing application capability, not a reason to
grow.

## Stage 10 — The `exports` dev-condition trap (Q8)

Independent investigation and fix. Nothing else depends on it.

- [ ] Six subpaths resolve `types` from `dist` and `default` from `src`, so a
      source edit is live while its types are whatever the last build emitted.
      `check:exports` compares key sets, not conditions, so it cannot see this.
- [ ] Agreed fix pending feasibility: give the `src/exports/*` shims relative
      imports instead of `@/`, then point `types` at `src` too. Plugin tsconfigs
      clear `paths`, which is why the `@/` imports fail there.
- [ ] If the fix lands, extend `check:exports` to compare conditions so the trap
      cannot return.

## Stage 11 — Lazy identity

Depends only on stage 5.

- [ ] `RequestContext` becomes `{ request, user? }`. The store holds the
      request; identity resolves on first ask and caches for that request.
- [ ] `getCurrentUser()` and `getCurrentRole()` become async — 21 call sites
      across 18 files, all already inside async functions.
- [ ] Collapse the four independent session resolvers (Astro middleware, Hono's
      `requireAuth`, Hono's `optionalAuth`, the cron poke route) into one. Their
      "has someone already done this?" branches get **deleted**, not relocated.
- [ ] The Astro middleware stops writing `Astro.locals` entirely, and
      `src/env.d.ts` stops declaring `App.Locals`. Nothing reads either, and the
      declaration merge breaks any host site that declares its own `user`.
- [ ] `resolveSessionUser` → `getSession` (Better Auth's vocabulary).

**Cautions.** Do not solve draft visibility by blanking the user.
`entries/operations/query.ts` already has `VisibilityShape`, `applyVisibility`
and `markPublic`; whatever a host page should see by default is decided at that
seam. If it is not obvious when this stage lands, raise it as its own item
rather than deciding it here.

## Stage 12 — Drop the transport mirror

Depends only on stage 5.

- [ ] Delete the shared `AstromechClient` contract. The app's surface is
      primary; the fetch client becomes a standalone typed REST wrapper, typed
      by what the wire actually returns.
- [ ] `configure({ baseUrl })` moves onto the fetch client and the local no-op
      is deleted. **A method implemented only to satisfy a name means the
      contract is fighting the implementation and losing.**
- [ ] `transport/local/index.ts` dissolves into the instance, losing its
      module-scope `setPluginClient` / `setPluginMethods` side effects, which
      makes the package's `"sideEffects": false` declaration true again. The
      plugin-runtime ↔ local import cycle they dodge needs an **explicit port**,
      not an import order.
- [ ] The `astromech/local` subpath retires, now that the code behind it is
      gone. "Local" leaves the vocabulary; no local/remote pair remains.
- [ ] Plugins keep receiving the `ctx` surface, never the app itself — nothing
      hands a plugin `destroy()`.

**Cautions.** Wire parity is enforced by mechanism, not by a shared interface:
the HTTP surface derives from the same services (method manifest → dispatch),
and a specific guarantee gets a parity test, as
`decisions/0056-better-auth-owns-the-users-format-not-its-ddl.md` did. Do not
re-derive the fetch client's types from the service types; the transports
genuinely differ (local returns full rows, the wire returns public projections).

## Stage 13 — Moves, renames and the comment pass

- [ ] `boot/relationship-index.ts` and `boot/validate-stored-content.ts` →
      `transport/cli/`, beside the only commands that call them. **Fix the stale
      header in `relationship-index.ts`** that still asserts a cross-domain rule
      `.dependency-cruiser.cjs` reversed.
- [ ] Renames per the spec's table: `wireEntryAccess` / `wireNotifyAccess` →
      `setX`, `cfg` → `entryType`, `pkgSrc` and `mod` spelled out.
- [ ] Sentence-style file headers throughout (three files still use Title Case
      labels). One verb for one operation (`toResolvedX` beside `resolveX` in
      the same file).
- [ ] Comment pass per restructured module, as the acceptance bar for the whole
      work. See the rules at the top of this file.

## Stage 14 — Docs and the gate

- [ ] `ARCHITECTURE.md` — the `integrations/` layer. `config/`, the narrowed
      boot layer, the moved leaf symbols and the read-config-at-call-time
      invariant went in as stages 1–3 landed, because that file is a map of the
      present and cannot wait for stage 14.
- [ ] `TERMINOLOGY.md` — an entry for "integration". "Application" is written;
      "local API" never appeared in the file.
- [ ] A decision record for what this work changed against 0057 — the spec's
      "What changed after 0057" table is its source.
- [ ] Reconcile `roadmap/planned/multi-runtime-and-framework-adapters.md` to the
      integration vocabulary.
- [ ] `apps/docs` — the `basePath` config change is user-facing.
- [ ] Delete `specs/application-architecture-map.md`.
- [ ] Full gate plus `check:boot`, `check:config`, `check:node-imports`,
      `check:exports`, `lint:deps`; `db:generate` reports no schema changes.

## Follow-ups this work creates

- `roadmap/planned/role-resolution-fails-open.md` — filed, not in scope.
- Default visibility shape for host-page queries, if stage 11 does not settle it.
