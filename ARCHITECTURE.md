# Astromech Architecture

A development-orientation map for working **on the CMS** — where things live and
the invariants to hold. It is deliberately thin: the canonical detail lives in
the code and the types (`packages/astromech/src/types/`). When this file and the
code disagree, the code wins — fix this file.

It describes the present only. Why something is the way it is, and what it used
to be, are in `decisions/`.

> User-facing guides (configuring a project, modelling content, writing plugins)
> belong in `apps/docs/`, not here.

## What it is

Astromech is a lightweight TypeScript CMS. It ships as a framework-agnostic core
plus an Astro integration that injects the admin SPA, an HTTP API, and a
type-safe client for reading content in templates.

**Infrastructure target:** Cloudflare — Workers runtime, D1 (SQLite) database, R2
(S3-compatible) storage. Other drivers exist (libsql, filesystem, s3) but
Cloudflare is the shape decisions are made for. **SSR only** for now. The D1
driver exists (`database/drivers/d1.ts`) but nothing has been run on Workers;
Postgres and MySQL are a future major
(`roadmap/planned/additional-database-drivers.md`).

**Node:** the floor is 22.13, stated in `engines.node` on every published
package. It is held in three places that must move together — `@types/node` at
`^22`, `target: "node22"` in every tsup config, and the Node 22 leg of the Test
and Boot matrix in `.github/workflows/ci.yml`. Development runs the Active LTS
(`.nvmrc` names 24), which CI also covers.

## The layer model

The source is a modular screaming-architecture DAG. Imports may only point
**down** this list; upward edges are forbidden, and peers inside a layer may read
one another:

```
astromech.ts · integrations · admin · codegen  entrypoints & composition root
transport (http · mcp · cli · tools)           delivery — http/client/ is the fetch Client (astromech/fetch), over the wire
policies                                       permission/confirmation wrappers over the manifest
entries · media · users · settings ·           domains — siblings, never import each other
  notifications
plugins/runtime · config · database · storage · capabilities
  email · ai · cron · cloudflare · request-context · fields · permissions
types · utilities · errors                     pure leaves
```

The six first-party plugins (`@astromech/{assistant,backups,forms,menus,redirects,seo}`)
live OUTSIDE this `src/` graph, in `packages/plugins/` — each a separately published
npm package that consumes core only through the public `astromech` surface. The
plugin-authoring API (`definePluginTable`, `createStorage`, codec helpers,
`Table` type vocabulary, …) is part of the root `astromech` export, not a
separate subpath. They prove the public surface can build a real plugin;
cross-package isolation is enforced by each package's `exports` boundary at
publish time. The plugin **runtime** (hook engine) stays a core capability.

Key invariants:

- **Domains are deep modules named for the business, not the tech.** Every domain
  owns a `service.ts` (its verbs), a `schema.ts` (`defineTable` table + Zod
  validation) and a `methods.ts` (its contract catalogue, which is what puts it
  in the method manifest). Two further files are per-domain, not universal:
  `visibility.ts` exists only where a domain projects a row into more than one
  shape (`entries`, `settings`), and `operations/` + `internal/` only where one
  `service.ts` has stopped being readable (`entries`, `media`, `users` —
  `settings` and `notifications` stay a single file). Tables are reached through
  `@/database/schema` (the table aggregator) rather than another domain's
  `schema.ts`. A domain may call a peer directly — the split is for organisation,
  not isolation, and the alternative was a second wire shape for the same
  concept.
- **A decomposed domain's `service.ts` is an assembler and nothing else.** It
  imports one function per verb from `operations/**` and names them on the
  service object; per-domain helpers live in `internal/**`, and nothing that is
  not a verb is exported from `service.ts`.
- **Capabilities sit below domains.** They expose primitives (`storage`, `database`,
  `fields`, `permissions`, `request-context`, `email`, `ai`, `cron`, `cloudflare`) and may
  not orchestrate domain logic.
- **Each capability owns its own driver slot; there is no central context object.**
  Every driver and override slot shares one mechanism (`utilities/registry.ts`)
  over a single `globalThis.__astromech` namespace, but never a shared type. A hub
  carrying every driver would have to import every domain's types, which is what
  this DAG exists to prevent. globalThis is not a taste choice — the package ships
  two tsup builds, `exports` subpaths that resolve to `src` in the repo and
  `dist` for npm, and Vite aliases that reach package source regardless of the
  map, so one module can be instantiated more than once in a process and the
  global is the only slot every copy shares. `createRegistry`
  is a single-value slot: required ones resolve-or-throw, genuinely optional ones
  expose `peek()` and no `get()` at all. `createKeyedRegistry` is the same slot keyed
  by string, for the per-type and per-name override maps.
  The namespace also carries a few **process guards** — a cron tick lock and
  interval handle, the duplicate-admin-UI check — as plain keys read directly
  rather than through a registry object. They share the duplicate-copy hazard
  without sharing the slot shape.
- **Process-wide state lives in a registry slot; module-scope singletons are not
  used.** That covers memoised values as well as boot-wired drivers: Better Auth
  builds on first ask inside `getAuth()` and holds the result in an optional slot
  (`users/auth.ts`), because a `let` at module scope is per-copy state that a
  second copy of the module cannot see.
- **Config is read at call time, never at module scope.** `createAstromech`
  resolves the author's config once and puts it in `config/registry.ts`; every
  reader calls `getConfig()` inside the function that needs it. A module-scope
  read runs before the request that boots the application, and the node adapter
  answers the resulting rejection by holding the socket open — so it presents as
  a hang, and only `check:boot` sees it.
- **`utilities/registry.ts` holds the only `declare global`.** Enforced by
  `no-restricted-syntax` in `eslint.config.js`; a new global goes in the namespace.
- **Leaves are pure.** `types/`, `utilities/`, and `errors/` import only other
  leaves or third-party packages.
- **A contract lives with the layer that implements it.** `types/` holds the
  vocabulary every layer shares: the data model, the config and plugin authoring
  contracts, fields, hooks, the service contracts and the query primitives. A
  contract only one layer implements lives with that layer, and a file the admin
  bundle also holds carries the `*.shared.ts` marker.
- **The application is the in-process surface; the fetch client is its own.**
  `astromech.ts` composes the domain services onto the instance an
  integration creates, and `transport/http/client/` is a standalone REST wrapper
  typed by what the wire returns. Parity between them is enforced by mechanism —
  the HTTP routes derive from the same services through the method manifest — and
  by a parity test where a specific guarantee matters
  (`tests/transport/http/routes/rpc-parity.test.ts`).
- **Permission enforcement is a property of the handle, not of the transport.**
  `scopedServices(role)` (`policies/scoped-services.ts`) refuses a method the
  role may not call, and every untrusted path composes it: the HTTP REST routes
  dispatch through it, `POST /rpc/:id` reaches it via `buildScopedDispatch`, and
  so does the AI tool-loop. The trusted paths compose nothing and say so —
  the application instance (SSR, hooks, seeding), `transport/cli` including
  `astromech call`, and the dev-only MCP server, which is why `buildDispatch`
  carries a method's `permission` without checking it. `permissionsFor` stays the
  seam for the route checks carrying logic no contract can state — `users.get`'s
  self-access, the last-admin guard, the entries routes answering 403 before 404
  — and each of those handlers names its reason where it is written.
- **`*.shared.ts` marks a domain file the admin bundle may hold.** The admin runs
  in a browser, so it may not import a domain or a server-side capability — a
  domain service drags `virtual:astromech/config`, and every driver and plugin the
  config names, into the client bundle. A pure function the browser needs from a
  domain (`entries/type-ids.shared.ts`, `media/serving/image/url.shared.ts`) stays
  where it lives and takes the suffix, which limits it to importing the leaves,
  `fields/`, and other `*.shared.ts` files. The fetch client sits on the same
  boundary and holds the same allowance, so the REST route table both halves of
  the HTTP transport read stays beside the routes it describes, at
  `packages/astromech/src/transport/http/routes/http-routes.shared.ts`.
- **Enforced** by `packages/astromech/.dependency-cruiser.cjs` (`pnpm run lint:deps`), which scans `packages/astromech/src` only — core's internal DAG. The layer rules there are generated from one `LAYERS` table, and a top-level `src/` directory missing from it fails the scan. Cross-package isolation is enforced by `exports` boundaries at publish, not a repo-wide scan.

## Directory map

The repo root is a **private workspace root** (`astromech-monorepo`). It owns
repo-wide tooling (eslint, prettier, stylelint, husky, lint-staged, changesets)
and delegates the main gate commands into the `packages/astromech` workspace.

Convention: `packages/*` = published to npm; `apps/*` = deployed/run, never
published.

```
packages/
├── astromech/       # the published `astromech` core package
│   ├── src/
│   │   ├── index.ts        # public framework-agnostic entry (re-exported via exports/)
│   │   ├── astromech.ts    # composition root — createAstromech/getAstromech, the Astromech type, the instance registry, and the create sequence
│   │   ├── registrations.ts # the register steps the create sequence runs (drivers · plugin runtime)
│   │   ├── plugin-access.ts # fills the plugin runtime's client and methods ports
│   │   │
│   │   │   ── entrypoints ─────────────────────────────────────────────────────
│   │   ├── integrations/   # framework and runtime glue — astro/ (index.ts the integration, astromech/astro · vite.ts · virtual-module.ts · routes.ts the injectRoute calls · middleware.ts, astromech/middleware · handler.ts, the one APIRoute behind every injected pattern) · cloudflare/ (index.ts, createWorkerEntry, astromech/cloudflare)
│   │   ├── admin/          # React admin SPA (TanStack Router; deep-imports the *.shared.ts domain leaves) — components/dev/ is import.meta.env.DEV-gated
│   │   ├── codegen/        # type generator + plugin-client manifest + method manifest (.astro/astromech.methods.json, plus manifest-registry.ts — the boot-generated copy)
│   │   │
│   │   │   ── delivery ────────────────────────────────────────────────────
│   │   ├── transport/      # http/ (Hono routes+middleware, plus client/ — the fetch Client, astromech/fetch) · cli/ · mcp/ · tools/ (tool dispatch + scoped tool surface, shared by MCP and the AI tool-loop)
│   │   │
│   │   │   ── policies ───────────────────────────────────────────────────
│   │   ├── policies/       # authorization policies over the manifest — what an actor may do, not a per-request guard — enforcement (scoped-services), method filtering, manifest annotation and confirmation; no domain logic here
│   │   │
│   │   │   ── plugin runtime (capability) ──────────────────────────────────
│   │   ├── plugins/        # plugins/runtime (hook engine) only — first-party plugins live in packages/plugins/; entry-access · notify-access · client-access are its ports onto the layers above
│   │   │
│   │   │   ── domains ────────────────────────────────────────────────────
│   │   ├── entries/        # entries domain: service (assembler) · operations/ · internal/ · schema · methods · visibility · url.shared
│   │   ├── media/          # media domain: service (assembler) · operations/ · internal/ · schema · methods · serving/image/
│   │   ├── users/          # users domain: service (assembler) · operations/ · internal/ · schema · methods · auth (Better Auth integration)
│   │   ├── settings/       # settings domain: service · schema · methods · visibility · page-values.shared
│   │   ├── notifications/  # notifications domain: service (+ notify) · schema · methods · user-scoped storage
│   │   │
│   │   │   ── capabilities ───────────────────────────────────────────────
│   │   ├── config/         # the config pipeline: load (jiti) · resolve (orchestration) + its named steps · validate/ · admin-config · registry (setConfig/getConfig)
│   │   ├── database/       # Kysely client/drivers + schema.ts aggregator + migrations.ts (runMigrations / drift check)
│   │   ├── storage/        # blob-storage registry + drivers/ (filesystem, r2, s3)
│   │   ├── cloudflare/     # binding-name resolution across Workers and Node
│   │   ├── permissions/    # permission model: roles, grammar, BUILT_IN_ROLES, can()
│   │   ├── fields/         # field/column builder, formatters, rich-text, helpers
│   │   ├── request-context/ # the AsyncLocalStorage request store, holding the Request that identity resolves from on first ask: index.ts (barrel) + request-context.ts (the service-free leaf)
│   │   ├── email/          # email drivers
│   │   ├── ai/             # model access: getModel / hasModel over the configured models
│   │   ├── cron/           # scheduled-job infrastructure
│   │   │
│   │   │   ── pure leaves ────────────────────────────────────────────────
│   │   ├── types/          # shared TS types — data model, config shape, field/hook contracts, the five domain service contracts, the typed-entry surface
│   │   ├── utilities/      # pure helpers (strings, dates, entry-fields, rich-text, entry-type-ids, entry-capabilities, image-widths, image-drivers, …)
│   │   ├── errors/         # base error classes
│   │   │
│   │   │   ── public surface ───────────────────────────────────────────
│   │   └── exports/        # thin re-export barrels; tsup builds from here — internals are private
│   ├── tests/              # mirrors src/
│   ├── scripts/
│   └── (tsup|vitest).config.ts · tsconfig*.json · .dependency-cruiser.cjs
│
└── plugins/         # first-party plugins as separate published packages
    ├── assistant/   # @astromech/assistant  (the AI assistant: admin route, tool loop, chat drawer)
    ├── backups/     # @astromech/backups     (ships a ./tables subpath of plain tables)
    ├── forms/       # @astromech/forms      (notification + spam provider seams a site can extend)
    ├── menus/       # @astromech/menus
    ├── redirects/   # @astromech/redirects  (ships a ./tables subpath of plain tables)
    └── seo/         # @astromech/seo        (admin React components ship as source via ./admin/*)

apps/
├── demo/            # demo Astro site — deployed, not published
└── docs/            # user-facing documentation markdown
```

## Plugin capability ports

Plugins access platform resources through three sanctioned ports on `PluginContext`:

- **`ctx.storage`** — a plugin-scoped view of the storage registry. Keys are auto-prefixed `plugin/<alias>/` on `put`/`get`/`delete` and de-prefixed on `list()`. Plugins never see or construct raw storage keys.
- **`ctx.email`** — `send(to, subject, element)`, backed by the email registry (`src/email/registry.ts`). The port renders the React element to html and text, so a plugin never touches `EmailMessage` or the renderer, and throws when the site configures no email driver. The envelope sender is the driver's, never the caller's.
- **`ctx.database`** — `{ dialect, dump?, restore? }`. `dump` and `restore` are optional and feature-detected from the driver. Code against their presence, not the dialect. Backed by the **driver registry** (`src/database/driver-registry.ts`), which retains the full `DatabaseDriver` object alongside the Kysely instance.

**`DatabaseDriver` capability seam:** `dump?()` and `restore?()` are optional fields on `DatabaseDriver` (`src/types/config.ts`). Implemented for libsql (local `file:` connections only — `VACUUM INTO` requires a local path); unimplemented on D1/Postgres drivers (feature-detects off). A driver may implement `dump` without `restore`.

**`ctx.config` is a projection of the resolved config, not the resolved config.** `PluginConfigView` (`src/types/plugins.ts`) is an explicit `Pick` of structural fields (the route prefixes, `entries`, `pluginEntries`, `adminPages`, `admin`, `media`, `users`, `roles`, `locales`, `defaultLocale`, `trash`, `publicSettingKeys`, `timezone`) plus `entryTypesWithField`. `makeConfigView` in `src/plugins/runtime/plugin-runtime.ts` builds it field by field rather than by spreading, so the allow-list is enforced at runtime and not only in the type.

Two layers keep a driver out of a plugin's hands, and they do different jobs. `ResolvedConfig` holds no capability drivers at all: `db`, `storage`, `email`, `scheduler` and `ai` are omitted from the type and destructured out in `resolveConfig`, and `media.image` is stripped from `ResolvedMediaConfig` the same way, so a plugin reaches storage through `ctx.storage`'s `plugin/<alias>/` prefix and email through `ctx.email`. The `Pick` then covers the other case: a field added to `ResolvedConfig` is invisible to plugins until it is named in both the `Pick` and `makeConfigView`, which is what makes the projection worth keeping once no driver is left to exclude. `decisions/0031-the-plugin-config-view-is-an-allow-list.md` has the per-capability reasoning.

## Plugin runtime boundary

**A plugin's server code runs in a different module graph from core's, and `ctx` is the only bridge across it.** This is an invariant, not a convention — the alternative does not merely violate a rule, it throws.

The integration takes a config **path** and the site's `astromech.config.ts` is evaluated twice. Once in **plain Node at config time**, inside `astro:config:setup` (`config/load.ts`), which is what route registration, the admin config, codegen and the build-time migration run read; and once in the **Vite SSR graph**, where `virtual:astromech/config` re-exports the same file. Every `plugin()` factory runs in both, so a plugin package is evaluated in two module registries and module-level state in it is not shared between them. The evaluation that boots is the SSR one: the injected middleware hands that module's `rawConfig` to `createAstromech`, so the registered `PluginDefinition`, with `rawRoutes[].handler`, service methods and hooks hanging off it, is the SSR-graph copy. Core's runtime code is the opposite: every subpath Vite loads — `astromech/middleware`, the injected `astromech/routes/handler.ts` and `astromech/admin/shell.astro`, and `astromech/ui*` — resolves through `exports` to package **source**, which `integrations/astro/vite.ts` compiles via the `@/` Vite alias it registers against `pkgSrc`.

The config-time evaluation is the constraint. A plugin package has to load under plain Node, with no Vite in the process:

|                  | how it is loaded                     | can it resolve `virtual:`? |
| ---------------- | ------------------------------------ | -------------------------- |
| core runtime     | Vite-compiled from `src`             | yes                        |
| a plugin package | Node-loaded from `dist`, config time | **no**                     |

So a plugin that imports a core module reaching `virtual:astromech/config` — which every domain service does — dies with `ERR_UNSUPPORTED_ESM_URL_SCHEME` under Node's ESM loader. **`astromech/methods` is unreachable from a plugin package for exactly this reason**, and it fails at _import_ time rather than at call time, because `exports/methods.ts` statically re-exports `scopedServices` and so loads the whole service graph.

**The rule this produces: a plugin package imports `astromech`, `astromech/ui` and `astromech/ui/app`, and nothing else from core.** `astromech` loads under plain Node, and so does `astromech/ui` — the component kit, whose components take their inputs from their props. `astromech/ui/app` does not: it carries the admin surface that needs the running admin (`useAstromechPlugin`, the `CommandPalette` module, the AI-context hooks, `ApiErrorPanel`), which reaches `virtual:astromech/admin-config` and the fetch client. The rule survives because a plugin's Node-loaded entry never imports it: only the plugin's source-shipped `./admin/*` components do, and those are compiled by the consumer's Vite, where the virtual module resolves. `packages/astromech/scripts/check-node-imports.mjs` spawns Node against the kit's built entry — the file npm resolves `astromech/ui` to — which is the check that keeps the two halves apart. Type-only imports from any subpath are fine, because they erase. Everything else arrives on `ctx`. New platform capabilities are therefore added as a capability port (above), never as a published subpath a plugin is expected to import — `ctx.methods.tools()` is the worked example, and `decisions/0007-plugin-core-boundary.md` holds the mechanism with the rejected alternatives. The **root `astromech` barrel** is the sanctioned third route: it is already the one barrel a plugin may import, so a capability whose surface is a pure function over a registry can ship from there and needs neither a port nor a subpath — `getModel`/`hasModel` do.

A port's implementation must be a **Vite-graph closure**, and it is registered by an explicit call rather than by an import side effect — the package is `sideEffects: false`, so a bare `import './plugin-access'` is tree-shaken away and the port never registers. `registrations.ts` makes the three calls (`setEntryAccess`, `setNotifyAccess`, `setPluginAccess`) in `registerPluginRuntime`, before `registerPlugins`. It is reached through `createAstromech`, which the injected middleware and the Cloudflare `scheduled()` handler both call in the serving process, so the graph that evaluates it is the graph the plugin's `ctx.entries` runs in.

`ssr.noExternal` does **not** fix this, and neither does teaching Node to resolve `virtual:` with module customization hooks. `decisions/0007-plugin-core-boundary.md` records why each fails.

Two consequences for anything loaded at config time — `plugin-runtime.ts`, the integration itself: imports must stay lazy where they reach a service (`request-context/request-context.ts` exists for this), and `pnpm run check:config` loads the demo config the way Astro does to catch a regression before a plugin is wired up. `pnpm run check:node-imports` covers the other half, asserting the plugin-facing subpaths still load under plain Node.

## App-owned migration model

Migrations are an **app artifact**, not a core artifact. Core ships schema definitions and types; it does not ship migration files.

- `astromech db:generate` — diffs the core `defineTable` tables (`CORE_TABLES`) against the app's `migrations/snapshot.json` (a homegrown snapshot/diff generator, not drizzle-kit — see `@astromech/schema-engine` for the engine and `src/database/generate.ts` for the `Table`-facing wrapper) and, if anything changed, writes a new `NNNN_<name>.ts` migration + regenerates `migrations/index.ts`'s static `MigrationProvider`. Output lands in the **app's** `migrations/` folder (e.g. `apps/demo/migrations/`). No-op prints "no changes" — this doubles as a CI drift gate.
- `astromech db:init` / `runMigrations` — resolve migrations from the **app cwd's** `./migrations/index.ts`, not the core package folder, and apply them via Kysely's `Migrator`.
- `astromech plugin:generate` — run from inside a **plugin package**: diffs that plugin's `definePluginTable` tables against its own `migrations/snapshot.json` and writes into the plugin's own `migrations/` directory. `db:generate` covers `CORE_TABLES` only; the app merges the two chains via `mergeMigrationProviders`.

The app owns its migration history. Adding a plugin, running `db:generate`, and committing the new migration files is the full workflow.

## Scheduler (cron)

Cadence lives in the **database**, not in deploy config, because schedules are runtime-editable from the admin. Platform-native cron (Cloudflare Cron Triggers, a system crontab) demotes to a dumb frequent tick; core does the due-evaluation against the live schedule. Every trigger converges on the same contract: _frequent poke → core due-eval_.

- **`SchedulerDriver`** (`src/cron/drivers/{interval,cloudflare,webhook}.ts`, published as `interval()`, `cloudflareCron()` and `webhook()`) abstracts _triggering only_ — it knows nothing about which jobs exist or are due. A config naming none gets whatever the integration nominated through `setDefaultScheduler`, and `interval()` when none did; `resolveSchedulerDriver` in `src/cron/registry.ts` is where the three are ordered.
- **`createWorkerEntry`** (`src/integrations/cloudflare/index.ts`, published as `astromech/cloudflare`) builds the Worker's `export default` from the Astro adapter's entry: `fetch` is the adapter's unchanged, and `scheduled` calls `createAstromech({ config })` before ticking, because a Cron Trigger never reaches the middleware. It nominates `cloudflareCron()` as the default scheduler, so a Worker owns no timer — `decisions/0059-the-worker-entry-is-a-cloudflare-integration.md`.
- **`_astromech_cron`** is the single source of truth for due-evaluation and doubles as the multi-instance **CAS lock** — the double-fire guard when N instances or overlapping ticks fire at once.
- **Registry holds handlers; the table holds cadence.** A job's manifest `schedule` is a seed/default written on first boot; the stored row wins thereafter, so an admin edit takes effect on the next tick with no redeploy.
- Due-eval parses cron expressions via `croner`; per-job try/catch isolates failures so one job's throw never aborts the tick.

`@astromech/backups` is the first real consumer (a cron job → dump → storage). Its manual run-now path uses an in-process guard rather than the cron lock (single-instance assumption in v1).

## Public entry points

Consumers import from subpaths, never deep into `src/`. The published surface is
defined by `exports` in `package.json` — that's canonical. In the repo, the
Astro-loaded subpaths (`./routes/handler.ts`, `./middleware`, `./admin/shell.astro`,
`./media/Image`) resolve to `src/` so a core edit reaches `apps/demo`
without a rebuild; `astromech/ui*` gets the same effect from the Vite aliases in
`packages/astromech/src/integrations/astro/vite.ts`, not from the map.
`publishConfig.exports` restores the full `dist/` map for npm.
`pnpm run check:exports` holds the two key sets identical and requires an entry's
`types` and `default` to resolve into the same tree. The ones to know:
`astromech` (core helpers + types, incl. the plugin-authoring API — there is no
separate `plugin-kit` subpath), `astromech/astro` (integration),
`astromech/fetch` (the fetch client — `astromechClient`, also the default
export), `astromech/middleware`,
`astromech/methods` (the server-side seam surface — the boot-generated method
manifest via `getMethodManifest`, plus `buildDispatch`, `buildScopedDispatch`,
`filterMethods`, `annotateManifest`, `scopedServices`, the confirmation helpers
and `formatAIContextMessage`; **core-internal in practice — a plugin package
cannot import it, see "Plugin runtime boundary"**),
`astromech/fields`, `astromech/database/schema`, `astromech/storage/{filesystem,r2,s3}`
(storage drivers), `astromech/cloudflare` (binding-name resolution), and the
`astromech` CLI bin. The first-party plugins are their own packages —
`@astromech/{assistant,backups,forms,menus,redirects,seo}` (see `packages/`).

## The development gate

Before a change lands, all of these pass. The husky pre-commit hook runs
lint-staged (eslint --fix + prettier) on touched files; `--no-verify` is not
used.

| Command                       | Checks                                                                                                                                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`          | `tsc -p tsconfig.test.json` across every published package, then `astro sync && tsc --noEmit` in `apps/demo` — the only place the generated types are consumed as a site consumes them                                                                |
| `pnpm run test:run`           | vitest across three suites — `packages/schema-engine/tests/`, `packages/astromech/tests/` (mirrors `src/`) and `packages/plugins/assistant/tests/`. The assistant suite resolves `astromech` through its exports map, so it needs `build` first       |
| `pnpm run build`              | tsup (explicit entries, dts). DTS worker can OOM — bump `NODE_OPTIONS=--max-old-space-size`.                                                                                                                                                          |
| `pnpm run lint`               | eslint over `packages/schema-engine/src` and `packages/astromech/src` only. The plugin packages have no `lint` script; the pre-commit hook lints their files anyway                                                                                   |
| `pnpm run lint:css`           | stylelint over `packages/astromech/src/admin/styles/`                                                                                                                                                                                                 |
| `pnpm run format:check`       | prettier over the repo                                                                                                                                                                                                                                |
| `pnpm run lint:deps`          | dependency-cruiser — enforces the modular DAG within `packages/astromech/src`: no upward edges, pure leaves, every top-level directory in a layer, and the browser boundary the admin and `*.shared.ts` files sit on                                  |
| `pnpm run check:config`       | `tsx astromech.config.ts` in the demo — loads the site config the way Astro does, catching a config-time import that reaches a domain service                                                                                                         |
| `pnpm run check:node-imports` | spawns plain `node` against built `dist` and imports each plugin-facing subpath. Needs `dist`, so it runs after `build`. See "Plugin runtime boundary"                                                                                                |
| `pnpm run check:exports`      | asserts `exports` and `publishConfig.exports` name the same subpaths, so a new one cannot be added to the repo map and forgotten in the published one, and that an entry's `types` and `default` resolve into the same tree                           |
| `pnpm run check:docs`         | resolves every repo-relative link and backticked path in markdown. Skips `specs/` and `roadmap/planned/`, which name files that do not exist yet                                                                                                      |
| `pnpm run check:boot`         | builds `apps/demo`, starts `dist/server/entry.mjs` against a scratch database, and asserts `/` 200, `/cms` 200, `/cms/api/entries/post` 401 and one config evaluation. Run on demand and in CI — a full build is far too slow for the pre-commit hook |

For refactors that move tables, `pnpm run db:generate` must also report "No
schema changes" (migration-neutrality).

## Further reading

- **`apps/docs/`** — user-facing guides: configuration, content modelling, data, plugin authoring, the CLI. `apps/docs/README.md` indexes them.
- **`packages/astromech/src/types/`** — the data model, config shape, field/permission/hook types.
  If you want the precise contract, read these rather than prose.
- **`decisions/`** — why the code is shaped this way, and what it used to be.
- **`.claude/skills/code`** — coding conventions (naming, TS rules, imports). **`.claude/skills/docs`** — which file a fact belongs in.

> `specs/` holds in-flight design notes for unbuilt work; they're deleted once a
> feature ships, so treat them as scratch — never link to them as a reference.
