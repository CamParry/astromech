# Astromech Architecture

The big-picture map for working on the CMS: what the parts are, where they
live, and the few rules that hold between them. Detail lives in the code and
the types (`packages/astromech/src/types/`); when this file and the code
disagree, the code wins, so fix the file. Why things are this way is in
`DECISIONS.md`. How to use Astromech is in `apps/docs/`.

## What it is

Astromech is a lightweight TypeScript CMS: a framework-agnostic core plus an
Astro integration. The integration injects three things into a site: the admin
SPA, an HTTP API, and a middleware that boots the application on first request.
Sites read content in templates through the in-process application or the
typed fetch client.

It runs on Node and on Cloudflare Workers with equal standing: every backend has a driver for each (`libsql` and `d1`, `filesystem`/`s3` and `r2`, `interval` and `cloudflareCron`), and nothing in core assumes one runtime. Further runtimes and frameworks are added the same way. SSR only. Node 22 is the floor.

## Repository layout

`packages/*` is published to npm, `apps/*` is deployed and never published.

```
packages/
├── astromech/        # the `astromech` core package (layout below)
├── schema-engine/    # @astromech/schema-engine — table diffing and DDL rendering
└── plugins/          # first-party plugins, one published package each:
                      # assistant · backups · forms · menus · redirects · seo
apps/
├── demo/             # the Astro site to run and browser-verify against, on Node
├── demo-cloudflare/  # the same core on Workers: D1, R2, Cron Triggers
└── docs/             # user-facing documentation
```

## The core package

`packages/astromech/src/` is one directory per module. Imports point down this list; modules on the same line may read one another. Nothing enforces this mechanically.

```
integrations · transport/cli · transport/mcp         process entry points, each boots the application
astromech.ts · plugins/runtime/plugin-runtime.ts     composition root
transport (http · tools) · admin                     delivery
codegen                                              generation
policies                                             who may call what
entries · media · users · settings · notifications   the content modules
plugins · config · database · storage · fields ·     the modules those build on
  permissions · hooks · request-context · email ·
  ai · cron
types · utilities · env · errors · registry.ts       pure leaves
```

- **`astromech.ts`** is the composition root: `createAstromech` resolves the
  config, wires the drivers, and composes the content services onto the
  application instance. `plugins/runtime/plugin-runtime.ts` is the other half of
  the composition root: `createPluginContext` assembles the plugin `ctx` from
  the same content services, so it imports them the way `astromech.ts` does.
  `exports/` holds the re-export barrels, one per published subpath except
  three that name a source file directly: `./admin/shell.astro`,
  `./media/Image` and `./routes/handler.ts`. Nothing else in `src/`
  re-exports — inside the package every import names the file that declares
  the symbol.
- **`integrations/`** holds two kinds of glue side by side. A **framework
  integration** answers how a request arrives and where the config lives:
  `astro/` is the Vite plugin, the virtual modules
  (`virtual:astromech/config`, `virtual:astromech/admin-config`), the injected
  routes (admin shell, API, media) and the boot middleware. A **runtime
  integration** answers where environment values come from and whether the host
  has an entry point that is not an HTTP request: `cloudflare/` builds the
  Worker entry and looks up bindings. A runtime only gets a directory when it
  needs one — Node and Vercel need no code.
- **`admin/`** is the React SPA (TanStack Router), mounted by `admin/shell.astro`
  under the configured `basePath`. It talks to the server only through the
  fetch client in `transport/http/client.ts`.
- **`codegen/`** generates the site's entry types and the method manifest.
- **`transport/`** is every way a call arrives: Hono routes and middleware in
  `http/`, the CLI, the dev-only MCP server, and `tools/`, the tool surface the
  MCP server and the AI tool-loop share. `cli/` and `mcp/` are process entry
  points of their own, each booting the application through `astromech.ts`, so
  they sit above the composition root; `http/` and `tools/` are what it calls.
  Transports dispatch to the content services through the method manifest; they hold no business logic.
- **`policies/`** decides what a role may call. `scopedServices(role)` wraps the
  services and refuses a method the role lacks; every untrusted path (HTTP, RPC,
  the AI tool-loop) composes it. Trusted paths (the application instance used in
  SSR and hooks, the CLI, the MCP server) do not.
- **The content modules** (`entries`, `media`, `users`, `settings`, `notifications`) own the business verbs. Each has a `service.ts` (its verbs), a `tables.ts` (its `defineTable` tables and row types), a contract catalogue (`contract.ts`, or `methods.ts` in `entries`) that puts it in the method manifest, and a `schema.ts` of Zod request schemas where it validates input. A large module splits its verbs into `operations/` and helpers into `internal/`, with `service.ts` assembling them. They are siblings: one may call another's service, but reaches tables through `database/tables.ts`.
- **The modules below them** (`database`, `storage`, `fields`, `config`, `permissions`, `hooks`, `request-context`, `email`, `ai`, `cron`, and `plugins` — the `define*` authoring API and every `runtime/` file except `plugin-runtime.ts`) are what the content modules build on. Each does one thing and holds no business logic.
- **Leaves** import only other leaves and third-party packages. A small pure file (a constant, a type, a function over its arguments) may sit inside any module and still be imported from any layer.

## The environment

Every environment read goes through `env/`. `resolveEnv(name)` returns the value
or `undefined`, `getEnv(name)` throws naming the variable, and `getEnvRecord()`
builds the record the plugin `ctx` exposes. A runtime integration declares its
own source with `setEnvSource`, which is how a Cloudflare Worker's `env` — string
vars and object bindings in one object — reaches `resolveEnv` and
`resolveBinding` alike. `admin/` is exempt: it reads `import.meta.env.DEV`,
which Vite replaces at build time, and never imports server modules.

## Drivers and registries

Every swappable backend is a **driver**: a plain object the site's config names
and core calls through a fixed interface. Database (`libsql`, `d1`), storage
(`filesystem`, `r2`, `s3`), email (`console`, `resend`, `smtp`), scheduler
(`interval`, `cloudflareCron`, `webhook`), and the AI models follow the same
pattern. The `DatabaseDriver` interface carries optional capabilities (`dump`,
`restore`) that callers feature-detect rather than switching on dialect.

Each module keeps its driver in its own **registry**, built on
`registry.ts` over the single `globalThis.__astromech` namespace. There is no
central context object, and no module-scope singletons: the package can be
loaded more than once in a process (two builds, source and dist resolution,
Vite aliases), and the global is the only namespace every copy shares. Config
follows the same rule: `createAstromech` stores the resolved config once and
every reader calls `getConfig()` at call time, never at module scope.

## Entries and fields

An **entry type** is declared in the site config with `defineEntryType`: a
name, its fields, slug rules, admin columns, and which features it enables.
An entry of any type lives in three tables, declared in
`entries/tables.ts`: `entries` holds what is unique per item and shared across
its locales (`type`, the preview token, `deletedAt`), `entry_content` holds one
row per locale of what editors author (title, slug, `fields` as JSON, status),
and `entry_versions` snapshots a content row. `entries/repository/entries-table.ts`
reads the first two joined and `entries/repository/versions.ts` owns the third;
field values are typed in the site by codegen. The entry id is the id every
caller uses, and locale is a parameter beside it. Versions, staging, preview
tokens, trash, statuses, translation and relationships are entries features, in
`entries/operations/`. The `relationships` table is a derived
index over field data, rebuildable from it.

**Fields** are shared by entry types, plugin tables and settings pages. `fields/builder.ts` is the authoring API (`fields.text(...)`), and
`fields/field-type-registry.ts` holds one `FieldType` per type name, carrying
its `build`, `coerce`, `validate` and `tsType`. The pipeline is
`coerce → default → validate`, recursing through nested fields (`group`,
`repeater`, `blocks`, `tree`) and passing through layout fields (`section`,
`tabs`, `accordion`), which store nothing. The admin renders a form from the
same field definitions.

`fields/parse-fields.ts` runs that pipeline for all four resources.
`parseFields` returns the coerced values and throws a 422; `safeParseFields`
returns what reported instead, for the callers that display errors rather than
reject. An entry write reaches it through `entries/internal/stored-fields.ts`,
which merges or inherits first and prunes dead relation ids after. Two
unrelated checks are both spelled `validate`: a field type's own, on its
`FieldType`, and the author's whole-resource function, declared on the entry
type, `media`, `users` or a settings page. The Zod parse over request input
around the fields is `parseInput`, in `errors/validation.ts`.

`TERMINOLOGY.md` defines the vocabulary (entry vs custom-table type, relation
vs relationship, staging, preview token).

## Database and migrations

`database/` wraps Kysely. Tables are declared with `defineTable` (core) and
`definePluginTable` (plugins); `database/tables.ts` aggregates every core
table. Migrations are an **app artifact**: `astromech db:generate` diffs the
declared tables against the app's `migrations/snapshot.json` and writes a new
migration into the app's `migrations/` folder, and `astromech db:init` applies
them. A plugin runs `astromech plugin:generate` against its own tables and
ships its own chain, which the app merges with `mergeMigrationProviders`. A
no-op `db:generate` doubles as the CI drift check.

## Plugins

A plugin is a separate npm package that receives a `PluginContext` (`ctx`) and
registers tables, routes, service methods, hooks, cron jobs and admin pages
through it. Everything a plugin needs from the platform is on `ctx`: the content services (`ctx.entries`, `ctx.media`, …), plus plugin-scoped handles on the backends, each narrower than the driver behind it: `ctx.storage` (keys prefixed `plugin/<alias>/`), `ctx.email`, `ctx.database` (`dialect`, plus `dump`/`restore` when the driver has them), and `ctx.config`, an explicit allow-list projection of the resolved config. A new platform feature is added to `ctx`, or as a pure function exported from the root `astromech` barrel, never as a subpath a plugin imports.

### Plugin runtime boundary

A plugin package may import `astromech`, `astromech/ui` and `astromech/ui/app`,
and nothing else from core. The site's `astromech.config.ts` is evaluated
twice: once in plain Node at config time (route registration, codegen,
migrations) and once in the Vite SSR graph that serves requests. So a plugin's
entry must load under plain Node, where `virtual:` modules do not exist.
`astromech/ui/app` reaches the virtual modules, so only a plugin's
source-shipped `./admin/*` components may import it, never its entry.
`pnpm run check:node-imports` verifies the plugin-facing subpaths load in Node.

The plugin runtime (`plugins/runtime/`) registers hooks into `hooks/`, the one
hook runner. A hook handler's throw propagates to the caller.

## The browser boundary

`admin/` runs in the browser. It may import the leaves, `fields/`, the fetch
client, and pure files from any module that import nothing server-side; a service or a driver would pull the config and every backend into the client
bundle. `pnpm run check:boot` loads the built admin and is the check.

## Scheduler

Cadence lives in the `_astromech_cron` table, not in deploy config, so an admin
edit takes effect on the next tick. A `SchedulerDriver` only triggers a tick;
`cron/runner.ts` evaluates which jobs are due and runs each in its own
try/catch. The table doubles as the lock against concurrent ticks.

## Public entry points

Consumers import subpaths, never deep into `src/`. `exports` in
`packages/astromech/package.json` is canonical; in the repo the Astro-loaded
subpaths resolve to `src/` so a core edit reaches `apps/demo` without a
rebuild, and `publishConfig.exports` restores the `dist/` map for npm.
`pnpm run check:exports` keeps the two in step. The ones to know: `astromech`
(core helpers, types and the plugin-authoring API), `astromech/astro`,
`astromech/fetch`, `astromech/middleware`, `astromech/methods` (the server-side
manifest and dispatch surface, core-internal in practice), `astromech/fields`,
`astromech/database/schema`, `astromech/storage/{filesystem,r2,s3}`,
`astromech/cloudflare`, and the `astromech` CLI bin.

## Further reading

- `AGENTS.md` — the gate commands and the workflow.
- `packages/astromech/src/types/` — the precise contracts.
- `TERMINOLOGY.md` — what a term means. `DECISIONS.md` — why.
- `apps/docs/` — user-facing guides.
