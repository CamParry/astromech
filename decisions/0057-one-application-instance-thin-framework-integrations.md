# 0057 — One application instance, thin framework integrations

**Date:** 2026-08-16
**Status:** proposed

Astromech gets a single application instance behind a memoised async factory,
and everything Astro-facing moves into an `integrations/astro/` directory that
does protocol adaptation and nothing else. The floating boot functions become
the instance's lifecycle. `roadmap/planned/application-instance-and-integrations.md`
holds the work.

## The problem

The runtime works, but its entry structure grew bottom-up and it shows:

- Two serving-process entry points each boot the runtime themselves — the
  injected middleware and the Cloudflare `scheduled()` handler — coordinated
  only by the memoised promise in `boot/ensure-booted.ts`. There is no front
  door; a host reaches the runtime by knowing which floating function to call.
- The framework boundary exists in the import graph (only five files import
  Astro, all type-only) but not in the directory tree: the integration sits in
  `boot/`, its middleware at the `src` root, its route entrypoints in a
  top-level `routes/`. Nothing tells a reader "this is the Astro-facing layer;
  everything else is the application".
- The seams surface as comment sprawl. Four comments in `boot/boot.ts` restate
  one module-graph constraint; `boot/relationship-index.ts` spends half its
  header warning the integration not to import it. A comment written to defend
  a structure is a flag that the structure is wrong, and these were.

## The shape

**The application — `Astromech` — is the primary definition, and everything
else is downstream of it.** It owns the domain services (full, trusted
shapes), the resolved config, and the lifecycle; `getAstromech()` boots the
runtime once and resolves to it. Payload is the model for the ergonomics
(`getPayload(config)` resolves to the one `BasePayload`, which _is_ the local
API), but the direction of definition matters more than the merge: the app is
not an extension of a client interface — clients are projections of the app.
Today's `Astromech` export (`transport/local/index.ts`) is an accessor
container with no behaviour of its own; it dissolves into the instance, so
one concept keeps one name (0009 is the precedent).

**Config enters the system at boot, and nowhere else.** The underlying disease
this record treats is ambient config: ~35 files import
`virtual:astromech/config` at module scope, and every one is welded to the one
module graph where `virtual:` resolves. That weld — not any single file's
layout — produced the whole comment class that triggered this work (the
import-comment sprawl in `boot.ts`, `relationship-index.ts`'s warning header,
the sub-barrel workarounds). The fix generalises a mechanism the codebase
already built once: `cron/registry.ts` grew `setRuntimeConfig` /
`getRuntimeConfig` precisely because the cron runner could not import the
virtual module. Config is supplied once, at application boot, and read through
the application's accessor at call time everywhere else — Payload's
`payload.config` and Laravel's container-read `config()` are the prior art.
Core modules become graph-agnostic; the few entry files that _supply_ config
are the only ones that care which process they run in, and the virtual module
itself remains as environment (it is how a consumer's Vite carries the
author's live config). Rejected: making only `getAstromech`'s own import lazy
— that suppresses the symptom at one site and leaves thirty others welded.

**`Astromech` is a factory-built object, not a class — on merits, not
convention.** Two properties decide it. First, `this`: Payload's `BasePayload`
defines its API methods as instance arrow properties so destructuring doesn't
lose the receiver — a class working full-time to behave like a closure; an
object of functions has no `this` to lose. Second, identity: class checks
(`instanceof`, `#private` brands) are nominal, and this codebase demonstrably
runs in multiple module registries (config-time vs SSR graph, tsup chunks)
where one class exists as two identities and `instanceof` silently fails
across them; structural objects are immune. The existing no-class convention
for drivers and storage turns out to encode these merits rather than being
style — recorded here so the convention carries its why.

**"Local" leaves the vocabulary.** With the mirror gone the word has no
referent: there is no local-vs-remote pair, only `Astromech` (the core) and
the fetch client (a wrapper over the wire API). The `astromech/local` subpath
retires — `getAstromech` ships from the root `astromech` barrel (Payload's
`import { getPayload } from 'payload'` shape), which the config-at-boot rule
makes honest: the barrel stays plain-Node importable because core modules no
longer carry graph-bound imports, and `check:node-imports` proves it.

**The transport mirror is dropped.** `AstromechClient` — one contract
implemented by both the local object and the fetch client — was the previous
guarantee that everything server-side is reachable over the wire. Two tells
said the contract was forced: local's `configure({ baseUrl })` no-op (a method
implemented only to satisfy a name — when a no-op exists to declare a
signature, the contract is fighting the implementation and losing), and the
shared service types claiming identical return shapes where the transports
genuinely differ (local returns full rows; the wire returns the public
projection by default). The fetch client (`astromechClient`, 0015) becomes a
standalone typed REST wrapper, typed by what the wire actually returns and
owning its fetch-only members. Wire-surface parity remains the goal — the
admin SPA does everything over HTTP — but it is enforced by mechanism, not by
interface: the HTTP surface derives from the same services (method manifest →
dispatch), and where a specific guarantee matters it is a parity test, as
0056 did for the users format. Plugins receive the `ctx` accessor surface,
never the app itself — nothing hands a plugin `destroy()`.

**The factory subsumes `ensure-booted.ts`.** Its cached in-flight promise is
the same mechanism Payload uses (a `global`-held promise, so concurrent first
requests share one init) and the async analogue of Laravel's
`hasBeenBootstrapped` guard. It must live on the `globalThis` registry, not in
a module-level variable: tsup emits multiple entry chunks, and a module-scoped
memo duplicates per chunk and boots twice (`utilities/registry.ts` records
this; Payload caches on `global` for the same reason under Next.js dev).

**Request context is the application's job, not the integration's.** The
session resolve and `runWithContext` call now inside `middleware.ts` move to an
application-level request handler; the integration hands over the `Request` and
maps the result onto its framework's own surface (`context.locals`, for Astro).
Payload (`createPayloadRequest`) and Better Auth (`auth.api.getSession`) both
draw the line here, so no framework wrapper reimplements auth.

**An integration is glue, and glue has a size.** Laravel's `public/index.php`
makes four moves: capture the input in the host's native form, get the app,
hand it over, emit the result. Better Auth's Next.js wrapper is ten lines over
a core `handler(Request): Promise<Response>`. That is the acceptance test for
`integrations/astro/` and for every integration after it: an integration that
needs a new branch in core is reporting a missing application capability, not a
reason to grow. Published specifiers (`astromech/astro`,
`astromech/middleware`, `astromech/routes/*`) do not change when the files
move — a subpath is a contract, not a directory listing (0015 governs new
subpaths; these existing ones stay as they are).

**`boot/` becomes the composition root and only that: bring the application
up.** The application and its lifecycle live there, and migrations get their
own module. Three things leave, because they are not boot:

- **The config pipeline moves to `src/config/`** — loading, resolution,
  validation and the admin projection are a subject of their own, not a step
  of starting up, and one 16KB resolver doing five jobs is what filing them
  under boot allowed. The directory splits the work into named steps
  (`load`, `resolve`, the validators, `admin-config`), which is what makes
  the numbered "Step 1…Step 5" comments inside today's resolver delete
  themselves. It sits above the domains in the layer table because it
  validates their declarations. This does not contradict config-at-boot: the
  pipeline _produces_ the resolved config, boot _supplies_ it to a low-level
  registry slot, and every reader takes it from there — the direction that
  lets a leaf read config without importing a module that imports domains.

- **The cross-domain maintenance passes** (`relationship-index.ts`,
  `validate-stored-content.ts`, `plugin-sources.ts` — 35% of the directory by
  size) run long after boot, only from CLI commands, and boot nothing. They
  move to `transport/cli/`, beside the two commands that are their only
  callers; `transport/cli/` is already declared a standalone entrypoint with
  its own no-upward exemption, so this needs no new directory and no rule
  change. Their placement in `boot/` was justified by a constraint that no
  longer exists: `relationship-index.ts`'s header says boot owns them because
  they compose three domains "which no domain may do", while
  `.dependency-cruiser.cjs` now states the opposite — domains are peers and
  may read one another, because forbidding it "only pushed the same work
  somewhere worse". The files stayed put after the rule relaxed, and the
  stale comment kept the placement looking deliberate. If an HTTP or admin
  caller ever wants a rebuild, it is promoted to an application operation
  then, on evidence rather than in anticipation.
- **`scheduled.ts`** is the Cloudflare Worker's `scheduled()` entry: it
  captures `scheduledTime`, gets the app, hands over a tick. That is the
  four-move integration shape, so it belongs in `integrations/cloudflare/`.
  This supersedes 0053's placement while keeping its principle intact — 0053
  held that a module belongs to the layer matching what it does, and chose
  `boot/` because the only alternative then was `cron/`, which produced an
  upward edge. An integrations tier did not exist to choose. The rule stands;
  the address changes.

The site's `astromech.config.ts` remains
the analogue of Laravel's `bootstrap/app.php`: the one file where an
application names its own wiring, declarative, no behaviour.

**Nothing request-scoped ever lives on the instance.** Workers isolates, Node
processes and dev HMR all reuse one instance across many requests. Laravel
needed Octane's clone-per-request sandbox to retrofit this; we keep the
existing rule instead — per-request state travels through `request-context/`
(AsyncLocalStorage), never on the application.

## Naming

- **`integrations/`**, not `adapters/`: "adapter" is taken twice here — Astro
  uses it for deploy targets, and 0012 reserved "driver" over "adapter" for our
  own pluggable backends. Better Auth's framework glue directory
  (`src/integrations/`) and Astro's own vocabulary both say integration.
- **`getAstromech()`**: the ecosystem's memoised-factory shape is `getX`
  (Payload's `getPayload`, Keystone's `getContext`). The Astro integration
  factory keeps its `astromech()` name beside it — an Astro integration
  exports a function named for the package (`sitemap()`, `react()`); the two
  live in different layers, processes, and subpaths.
- **Boot lifecycle phase names, chosen once, no aliases ever** (Apostrophe's
  legacy-alias debt is the cautionary tale): **register drivers → register
  plugins → boot plugins → ready → start scheduler**. The plugin pair stays
  `register`/`boot` — the established two-phase convention (Laravel providers,
  Strapi's register/bootstrap) whose split is semantic: register declares and
  binds only, boot may use anything registered. "Wire" is retired
  (`wireEntryAccess` → `setX`, matching the registry setters): in this
  ecosystem "wire" means the transport ("wire format", 0013), not wiring up.
- The integration's middleware file is named for its framework (`astro`), not
  for its mechanism (`middleware`) — the mechanism is Astro's vocabulary for
  the slot it plugs into, and the file will hold the whole glue surface.

## Rejected

- **Status quo** (floating functions + per-domain registries as the only
  structure). Works, but leaves no front door, four self-booting call sites,
  and an invisible framework boundary. The registries themselves stay — they
  are the storage mechanism under the instance, and their reason for existing
  (per-chunk module duplication) is unchanged.
- **Renaming `middleware.ts` to `application.ts`.** The file exports an Astro
  `MiddlewareHandler`; the rename would relabel an adapter artifact with the
  application's name. The instinct behind it lands as the split above instead.
- **The app as an extension of the client contract**
  (`AstromechApp extends AstromechClient`). It kept the mirror's forcing and
  inverted the natural direction of definition: the core entity would be
  defined in terms of a consumption shape. Rejected with the mirror itself.
- **A container shape (`app.api` holding the accessor).** Honest separation of
  lifecycle from data access, but it adds a hop to every call, needs a second
  contested noun, and diverges from the `getPayload` ergonomics the audience
  knows. The type system carries the separation instead: what a consumer may
  touch is decided by the type it is handed (the `ctx` surface for plugins),
  not by object nesting.
- **Migrations on serving boot.** Apostrophe proves it can be done safely
  (per-migration record + cross-instance lock + fresh-install-marks-all-run),
  and Ghost proves what happens without the kit (N replicas racing the
  migration table). For an embedded core the Directus shape wins: migrate by
  explicit command only, and at boot run a drift check that warns and never
  mutates. If auto-migrate is ever revisited, it starts from Apostrophe's kit
  (the lock is a D1 conditional insert on Workers), not from scratch.
- **Threading the instance through every service (full DI).** The honest
  version of "no ambient access" means every domain function takes the app as
  an argument. Payload doesn't do it, Laravel doesn't do it (the container is
  ambient), and the churn buys little while the registries already give one
  seam per capability. The factory is a front door and a lifecycle, not a
  dependency-injection rework.
- **A comment instead of a restructure.** The prior state documented its entry
  tangle in prose. The rule this record commits to: a comment may explain the
  environment (platform limits, module-graph physics), never defend the
  design; a comment that justifies a decision is a flag to rethink the
  structure, and only when the structure genuinely survives the rethink does
  the justification move to a record here.
