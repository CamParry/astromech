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

## The layer model

The source is a modular screaming-architecture DAG. Imports may only point
**down** this list; upward edges are forbidden, and peer domains may never import
one another:

```
routes · admin · boot · codegen · cli          entrypoints & composition root
transport (http · local · mcp · cli · tools)   delivery — http/client/ is the fetch Client (astromech/fetch), over the wire
policies                                       permission/confirmation wrappers over the manifest
entries · media · users · settings ·           domains — siblings, never import each other
  notifications
plugins/runtime · database · storage ·         capabilities
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

- **Domains are deep modules named for the business, not the tech.** Each owns its
  `service.ts`, `schema.ts` (`defineTable` table + Zod validation), `methods.ts`,
  and `visibility.ts`. Cross-domain data goes through `@/database/schema` (the
  table aggregator) or a shared capability — never via a direct peer import. The
  only permitted exception is a `schema.ts` foreign-key cross-reference.
- **Capabilities sit below domains.** They expose primitives (`storage`, `database`,
  `fields`, `permissions`, `request-context`, `email`, `ai`, `cron`, `cloudflare`) and may
  not orchestrate domain logic.
- **Each capability owns its own driver slot; there is no central context object.**
  Slots share one mechanism (`utilities/registry.ts`) over a single
  `globalThis.__astromech` namespace, but never a shared type. A hub carrying every
  driver would have to import every domain's types, which is what this DAG exists
  to prevent. globalThis is not a taste choice — tsup emits several entry chunks and
  a module-level singleton duplicates across them. Required slots resolve-or-throw;
  genuinely optional ones expose `peek()` and no `get()` at all.
- **Leaves are pure.** `types/`, `utilities/`, and `errors/` import only other
  leaves or third-party packages.
- **Enforced** by `packages/astromech/.dependency-cruiser.cjs` (`npm run lint:deps`), which scans `packages/astromech/src` only — core's internal DAG. Cross-package isolation is enforced by `exports` boundaries at publish, not a repo-wide scan.

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
│   │   ├── middleware.ts   # Astro middleware entry; boots the runtime on the first request (astromech/middleware)
│   │   │
│   │   │   ── entrypoints & composition root ──────────────────────────────────
│   │   ├── boot/           # composition root — boots & wires all layers; Astro integration (astromech/astro)
│   │   ├── routes/         # 3 Astro APIRoute entrypoints injected by the integration (api / auth / media)
│   │   ├── admin/          # React admin SPA (TanStack Router; deep-imports a few pure domain leaves) — components/dev/ is import.meta.env.DEV-gated
│   │   ├── codegen/        # type generator + plugin-client manifest + method manifest (.astro/astromech.methods.json, plus manifest-registry.ts — the boot-generated copy)
│   │   │
│   │   │   ── delivery ────────────────────────────────────────────────────
│   │   ├── transport/      # local/ (astromech/local) · http/ (Hono routes+middleware, plus client/ — the fetch Client, astromech/fetch) · cli/ · mcp/ · tools/ (tool dispatch + scoped tool surface, shared by MCP and the AI tool-loop)
│   │   │
│   │   │   ── policies ───────────────────────────────────────────────────
│   │   ├── policies/       # permission/confirmation wrappers over the manifest — no domain logic here
│   │   │
│   │   │   ── plugin runtime (capability) ──────────────────────────────────
│   │   ├── plugins/        # plugins/runtime (hook engine) only — first-party plugins live in packages/plugins/
│   │   │
│   │   │   ── domains ────────────────────────────────────────────────────
│   │   ├── entries/        # entries domain: service · schema · methods · visibility · url · type-ids
│   │   ├── media/          # media domain: service · schema · serving/image/
│   │   ├── users/          # users domain: service · schema · auth (Better Auth integration)
│   │   ├── settings/       # settings domain: service · schema · page-values
│   │   ├── notifications/  # notifications domain: service · schema · user-scoped storage
│   │   │
│   │   │   ── capabilities ───────────────────────────────────────────────
│   │   ├── database/       # Kysely client/drivers + schema.ts aggregator
│   │   ├── storage/        # blob-storage registry + drivers/ (filesystem, r2, s3)
│   │   ├── cloudflare/     # binding-name resolution across Workers and Node
│   │   ├── permissions/    # permission model: roles, grammar, BUILT_IN_ROLES, can()
│   │   ├── fields/         # field/column builder, formatters, rich-text, helpers
│   │   ├── request-context/ # the AsyncLocalStorage request store: index.ts (barrel) + request-context.ts (the service-free leaf)
│   │   ├── email/          # email drivers
│   │   ├── ai/             # model access: getModel / hasModel over the configured models
│   │   ├── cron/           # scheduled-job infrastructure
│   │   │
│   │   │   ── pure leaves ────────────────────────────────────────────────
│   │   ├── types/          # shared TS types — data model, config shape, field/hook contracts
│   │   ├── utilities/      # pure helpers (strings, dates, entry-fields, rich-text, …)
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

Plugins access platform resources through two sanctioned, plugin-scoped handles on `PluginContext`:

- **`ctx.storage`** — a plugin-scoped view of the storage registry. Keys are auto-prefixed `plugin/<alias>/` on `put`/`get`/`delete` and de-prefixed on `list()`. Plugins never see or construct raw storage keys.
- **`ctx.database`** — `{ dialect, dump?, restore? }`. `dump` and `restore` are optional and feature-detected from the driver. Code against their presence, not the dialect. Backed by the **driver registry** (`src/database/driver-registry.ts`), which retains the full `DatabaseDriver` object alongside the Kysely instance.

**`DatabaseDriver` capability seam:** `dump?()` and `restore?()` are optional fields on `DatabaseDriver` (`src/types/config.ts`). Implemented for libsql (local `file:` connections only — `VACUUM INTO` requires a local path); unimplemented on D1/Postgres drivers (feature-detects off). A driver may implement `dump` without `restore`.

## Plugin runtime boundary

**A plugin's server code runs in a different module graph from core's, and `ctx` is the only bridge across it.** This is an invariant, not a convention — the alternative does not merely violate a rule, it throws.

The integration takes a config **path** and the site's `astromech.config.ts` is evaluated twice. Once in **plain Node at config time**, inside `astro:config:setup` (`boot/config-loader.ts`), which is what route registration, the admin config, codegen and the build-time migration run read; and once in the **Vite SSR graph**, where `virtual:astromech/config` re-exports the same file. Every `plugin()` factory runs in both, so a plugin package is evaluated in two module registries and module-level state in it is not shared between them. The evaluation that boots is the SSR one: `src/middleware.ts` hands that module's `rawConfig` to `initRuntime`, so the registered `PluginDefinition`, with `rawRoutes[].handler`, service methods and hooks hanging off it, is the SSR-graph copy. Core's runtime code is the opposite: the integration injects routes pointing at package **source** (`pkgSrc` in `boot/astro.ts`), so Vite compiles it.

The config-time evaluation is the constraint. A plugin package has to load under plain Node, with no Vite in the process:

|                  | how it is loaded                     | can it resolve `virtual:`? |
| ---------------- | ------------------------------------ | -------------------------- |
| core runtime     | Vite-compiled from `src`             | yes                        |
| a plugin package | Node-loaded from `dist`, config time | **no**                     |

So a plugin that imports a core module reaching `virtual:astromech/config` — which every domain service does — dies with `ERR_UNSUPPORTED_ESM_URL_SCHEME` under Node's ESM loader. **`astromech/methods` is unreachable from a plugin package for exactly this reason**, and it fails at _import_ time rather than at call time, because `exports/methods.ts` statically re-exports `scopedServices` and so loads the whole service graph.

**The rule this produces: a plugin package imports `astromech` and `astromech/ui`, and nothing else from core.** Both load under plain Node; type-only imports from any subpath are fine, because they erase. Everything else arrives on `ctx`. New platform capabilities are therefore added as a capability port (above), never as a published subpath a plugin is expected to import — `ctx.methods.tools()` is the worked example, and `decisions/0007-plugin-core-boundary.md` holds the mechanism with the rejected alternatives. The **root `astromech` barrel** is the sanctioned third route: it is already the one barrel a plugin may import, so a capability whose surface is a pure function over a registry can ship from there and needs neither a port nor a subpath — `getModel`/`hasModel` do.

A port's implementation must be a **Vite-graph closure**. The precedent is `setPluginClient`: `transport/local/index.ts` calls it at module top level, so whichever graph evaluates that module is the graph the plugin's `ctx.entries` runs in. `setPluginMethods` is wired on the same line. `initRuntime` sits in that graph too, its only caller being `src/middleware.ts`, which runs in the serving process.

`ssr.noExternal` does **not** fix this, and neither does teaching Node to resolve `virtual:` with module customization hooks. `decisions/0007-plugin-core-boundary.md` records why each fails.

Two consequences for anything loaded at config time — `plugin-runtime.ts`, the integration itself: imports must stay lazy where they reach a service (`request-context/request-context.ts` exists for this), and `npm run check:config` loads the demo config the way Astro does to catch a regression before a plugin is wired up. `npm run check:node-imports` covers the other half, asserting the plugin-facing subpaths still load under plain Node.

## App-owned migration model

Migrations are an **app artifact**, not a core artifact. Core ships schema definitions and types; it does not ship migration files.

- `astromech db:generate` — diffs the core `defineTable` tables (`CORE_TABLES`) against the app's `migrations/snapshot.json` (a homegrown snapshot/diff generator, not drizzle-kit — see `@astromech/schema-engine` for the engine and `src/database/generate.ts` for the `Table`-facing wrapper) and, if anything changed, writes a new `NNNN_<name>.ts` migration + regenerates `migrations/index.ts`'s static `MigrationProvider`. Output lands in the **app's** `migrations/` folder (e.g. `apps/demo/migrations/`). No-op prints "no changes" — this doubles as a CI drift gate.
- `astromech db:init` / `runMigrations` — resolve migrations from the **app cwd's** `./migrations/index.ts`, not the core package folder, and apply them via Kysely's `Migrator`.
- `astromech plugin:generate` — run from inside a **plugin package**: diffs that plugin's `definePluginTable` tables against its own `migrations/snapshot.json` and writes into the plugin's own `migrations/` directory. `db:generate` covers `CORE_TABLES` only; the app merges the two chains via `mergeMigrationProviders`.

The app owns its migration history. Adding a plugin, running `db:generate`, and committing the new migration files is the full workflow.

## Scheduler (cron)

Cadence lives in the **database**, not in deploy config, because schedules are runtime-editable from the admin. Platform-native cron (Cloudflare Cron Triggers, a system crontab) demotes to a dumb frequent tick; core does the due-evaluation against the live schedule. Every trigger converges on the same contract: _frequent poke → core due-eval_.

- **`SchedulerDriver`** (`src/cron/drivers/{node,cloudflare,http}.ts`) abstracts _triggering only_ — it knows nothing about which jobs exist or are due.
- **`_astromech_cron`** is the single source of truth for due-evaluation and doubles as the multi-instance **CAS lock** — the double-fire guard when N instances or overlapping ticks fire at once.
- **Registry holds handlers; the table holds cadence.** A job's manifest `schedule` is a seed/default written on first boot; the stored row wins thereafter, so an admin edit takes effect on the next tick with no redeploy.
- Due-eval parses cron expressions via `croner`; per-job try/catch isolates failures so one job's throw never aborts the tick.

`@astromech/backups` is the first real consumer (a cron job → dump → storage). Its manual run-now path uses an in-process guard rather than the cron lock (single-instance assumption in v1).

## Public entry points

Consumers import from subpaths, never deep into `src/`. The published surface is
defined by `exports` in `package.json` — that's canonical. The ones to know:
`astromech` (core helpers + types, incl. the plugin-authoring API — there is no
separate `plugin-kit` subpath), `astromech/astro` (integration),
`astromech/local` & `astromech/fetch` (the two API consumers — local exports
`Astromech`, fetch exports `astromechClient`; both also default-export it),
`astromech/middleware`,
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

| Command                      | Checks                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`          | `tsc -p tsconfig.test.json` (delegates to `packages/astromech`)                                                                                                     |
| `npm run test:run`           | vitest across three suites — `packages/schema-engine/tests/`, `packages/astromech/tests/` (mirrors `src/`) and `packages/plugins/assistant/tests/`                  |
| `npm run build`              | tsup (explicit entries, dts). DTS worker can OOM — bump `NODE_OPTIONS=--max-old-space-size`.                                                                        |
| `npm run lint`               | eslint over `packages/schema-engine/src` and `packages/astromech/src` only. The plugin packages have no `lint` script; the pre-commit hook lints their files anyway |
| `npm run lint:css`           | stylelint over `packages/astromech/src/admin/styles/`                                                                                                               |
| `npm run format:check`       | prettier over the repo                                                                                                                                              |
| `npm run lint:deps`          | dependency-cruiser — enforces the modular DAG invariants within `packages/astromech/src` (no upward edges, no peer-domain imports, pure leaves)                     |
| `npm run check:config`       | `tsx astromech.config.ts` in the demo — loads the site config the way Astro does, catching a config-time import that reaches a domain service                       |
| `npm run check:node-imports` | spawns plain `node` against built `dist` and imports each plugin-facing subpath. Needs `dist`, so it runs after `build`. See "Plugin runtime boundary"              |
| `npm run check:docs`         | resolves every repo-relative link and backticked path in markdown. Skips `specs/` and `roadmap/planned/`, which name files that do not exist yet                    |

For refactors that move tables, `npm run db:generate` must also report "No
schema changes" (migration-neutrality).

## Further reading

- **`apps/docs/`** — user-facing guides: configuration, content modelling, data, plugin authoring, the CLI. `apps/docs/README.md` indexes them.
- **`packages/astromech/src/types/`** — the data model, config shape, field/permission/hook types.
  If you want the precise contract, read these rather than prose.
- **`decisions/`** — why the code is shaped this way, and what it used to be.
- **`.claude/skills/code`** — coding conventions (naming, TS rules, imports). **`.claude/skills/docs`** — which file a fact belongs in.

> `specs/` holds in-flight design notes for unbuilt work; they're deleted once a
> feature ships, so treat them as scratch — never link to them as a reference.
