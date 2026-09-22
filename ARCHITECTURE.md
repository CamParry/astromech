# Astromech Architecture

Where the parts live and the rules between them. The contracts are the types in `packages/astromech/src/types/`; when this file and the code disagree, fix the file.

## What it is

A framework-agnostic core plus an Astro integration, which injects the admin SPA, an HTTP API, and a middleware that boots the application on the first request. It runs on Node and on Cloudflare Workers with equal standing: every backend has a driver for each, and nothing in core assumes one. SSR only.

## Repository layout

`packages/*` is published to npm, `apps/*` is deployed and never published.

```
packages/
├── astromech/        # the `astromech` core package (layout below)
├── admin/            # @astromech/admin: the admin app, the component kit and its Vite helper
├── schema-engine/    # @astromech/schema-engine: table diffing and DDL rendering
└── plugins/          # first-party plugins, one published package each:
                      # assistant · backups · forms · menus · redirects · seo
apps/
├── demo/             # the Astro site to run and browser-verify against, on Node
├── demo-cloudflare/  # the same core on Workers: D1, R2, Cron Triggers
└── docs/             # user-facing documentation
```

## The layer model

`packages/astromech/src/` is one directory per module. Imports point down this list; modules on the same line may read one another. Nothing enforces this mechanically.

```
integrations · transport/cli · transport/mcp         process entry points, each boots the application
astromech.ts · plugins/runtime/plugin-runtime.ts ·   composition root
  app-context/app-context.ts
transport (http · tools)                             delivery
codegen                                              generation
policies                                             who may call what
entries · globals · media · users · settings ·       the content modules
  notifications
auth                                                 beside them: the better-auth wiring, and it may import users
content                                              the shared content repository, under entries, globals, media and users
plugins · config · database · storage · fields ·     the modules those build on
  permissions · hooks · request-context · email ·
  ai · cron
types · services · utilities · errors ·              pure leaves
  env.ts · registry.ts
```

- **Composition root.** `createAstromech` in `astromech.ts` resolves the config, wires the drivers and composes the content services onto the application instance. `createPluginContext` in `plugins/runtime/plugin-runtime.ts` builds the plugin `ctx` from the same services. `createAppContext` in `app-context/app-context.ts` builds the `AppContext` a method receives, and `app-context/services.ts` binds each content module's definition to the current request with `bindCurrent`.
- **`exports/`** holds one barrel per published subpath. Only it and `types/index.ts` are barrels; everywhere else an import names the file that declares the symbol.
- **`integrations/`**: `astro/` is the framework integration (Vite config, virtual modules, injected routes, boot middleware); `cloudflare/` is the runtime integration (the Worker entry and binding lookup). `TERMINOLOGY.md` defines the two kinds.
- **`codegen/`** generates the site's entry types, the method manifest and the plugin client manifest.
- **`transport/`** is every way a call arrives: Hono routes in `http/`, the CLI, the dev-only MCP server, and `tools/`, the tool surface MCP and the AI tool-loop share. `cli/` and `mcp/` boot the application themselves, so they sit above the composition root. Transports hold no business logic.
- **`policies/`** decides what a role may call. `scopedServices(role)` wraps the core services and every plugin method and refuses a call the role lacks; every untrusted caller (REST, RPC, plugin RPC, the AI tool-loop) goes through it. Trusted paths (SSR, hooks, `ctx.plugins`, the CLI, MCP) use the raw services. A caller that names a method by manifest id goes through `callMethod`; REST and plugin RPC call the scoped handle directly.
- **`auth/`** holds the better-auth wiring, session resolution, first-run setup and better-auth's own tables. It imports `users` to read the user a session names; `users` never imports `auth`.
- **The modules below them** hold no business logic. `plugins/` here means the `define*` authoring API and every `runtime/` file except `plugin-runtime.ts`.
- **Leaves** import only other leaves and third-party packages. A small pure file (a constant, a type, a function over its arguments) may sit inside any module and still be imported from any layer.

### Content modules

`entries`, `globals`, `media`, `users`, `settings` and `notifications` own the business verbs. Each has a `service.ts` that assembles its `methods/` into a `defineService` definition, and a `tables.ts`; most also have a `schema.ts` of shared Zod request schemas. A method file exports one `defineServiceMethod` object: access rule, input and output schemas, effect hints, the capability its target must declare, and the handler. The method manifest, `policies/scoped-services.ts` and the REST mount all read that catalogue; `entries/catalogue.ts` fixes it per entry type, because an entry method's permission and schemas vary with the type.

A handler reaches the user, config, hooks and sibling services through its `AppContext`, never the request store, config registry or hook runner (lint enforces this). `defineService.bind()` has already parsed its input. One content module may call another's service, but reaches tables through `database/tables.ts`. A content module does not import the composition root; `media/serving/handler.ts` is the one exception.

`content/` holds the shared repository over `{ table, contentTable, versionsTable }`, the translatable, versioning and visibility helpers, and the relationship-index policy that users and media share.

## The admin package

`@astromech/admin` is the React SPA, the component kit behind `astromech/ui`, and a Vite helper. Core depends on it, so a site installs core alone. It ships as source and the site's Vite compiles it, so plugin components and the admin share one kit and one React. `packages/admin/AGENTS.md` has the rest.

## The environment

Every environment read goes through `src/env.ts`: `resolveEnv(name)` returns the value or `undefined`, and `getEnvRecord()` builds the record on `ctx.env`. A runtime integration sets its own source with `setEnvSource`; that is how a Worker's `env` (string vars and bindings in one object) reaches `resolveEnv` and `resolveBinding`, which lives in `integrations/cloudflare/bindings.ts`. The admin is exempt: it reads only `import.meta.env.DEV`, which Vite replaces at build time.

## Drivers and registries

Every swappable backend is a **driver**: a plain object the site's config names and core calls through a fixed interface.

| Backend   | Drivers                                 | Source                                                                 |
| --------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Database  | `libsql`, `d1`                          | `database/drivers/`                                                    |
| Storage   | `filesystem`, `s3`, `r2`                | `storage/drivers/`                                                     |
| Email     | `consoleEmail`, `resend`, `smtp`        | `email/drivers/`                                                       |
| Scheduler | `interval`, `webhook`, `cloudflareCron` | `cron/drivers/`, published as `astromech/scheduler/*`                  |
| Images    | `sharp`, `cloudflareImages`             | `media/serving/image/drivers/`, published as `astromech/media/image/*` |

AI models follow the same pattern. Optional capabilities (`dump`, `restore` on `DatabaseDriver`) are feature-detected, not switched on dialect.

Each module keeps its driver in its own **registry**, built on `registry.ts` over the single `globalThis.__astromech` namespace. There are no module-scope singletons: the package can load more than once in a process (two builds, source and dist, Vite aliases), and the global is the only namespace every copy shares. Config follows the same rule: `createAstromech` stores it once, and readers call `getConfig()` at call time.

## Entries and fields

An **entry type** is declared with `defineEntryType`. Entry features (versions, staging, preview tokens, trash, statuses, translation, relationships) live in `entries/methods/`. Callers use the entry id, with locale as a separate parameter.

### Resources

Entries, media items and users each live in three tables: a resource row (what is shared across locales), a content row per locale (what editors author, including `fields` as JSON), and a versions table that snapshots content rows. `content/repository/versions.ts` owns versions for all three. The differences:

- **Entries** (`entries/tables.ts`): the resource row holds `type`, the preview token and `deletedAt`; the content row holds title, slug and status. `entries/repository/entries-table.ts` reads the two joined.
- **Media** (`media/tables.ts`): the resource row holds the file and its metadata; the bytes are in the storage driver under a key derived from the media id. `media/repository.ts` adds the library list queries. No statuses, staging or trash.
- **Users** (`users/tables.ts`): better-auth owns the `users` row. First-run setup writes the first one through better-auth and the users service writes the rest. `name`, `email` and `role` ignore locale. Sessions, accounts and verifications are better-auth's rows, in `auth/tables.ts`.

Media and users opt into translation with `media: { translatable: true }` and `users: { translatable: true }`; versioning is always on. Deleting a user leaves the rest to the database: each reference to `users` declares `onDelete: 'set null'` or `'cascade'`, and the migration runner refuses a database that does not enforce foreign keys. The `relationships` table is a derived index over field data.

### Fields

Fields are shared by entry types, globals, media, users and plugin tables. `fields/builder.ts` is the authoring API (`fields.text(...)`), and `fields/field-type-registry.ts` holds one `FieldType` per type name with its `build`, `coerce`, `validate` and `tsType`. `fields/parse-fields.ts` runs `coerce → default → validate`, recursing through nested fields and passing through layout fields, which store nothing. `parseFields` throws a 422; `safeParseFields` returns the report instead. An entry write reaches it through `entries/internal/stored-fields.ts`, which merges or inherits first and prunes dead relation ids after. The Zod parse of the request around the fields is `parseInput`, in `errors/validation.ts`.

## Database and migrations

`database/` wraps Kysely. Core tables are declared with `defineTable` and gathered in `database/tables.ts`; plugins use `definePluginTable`. Migrations are an app artifact: `astromech db:generate` diffs the declared tables against `snapshot.json` in the config's `migrationsDir` and writes a migration there, and `astromech db:init` applies the chain. A plugin generates its own chain with `astromech plugin:generate`. Core merges the plugin chains into the app's with `mergeMigrationProviders` from `@astromech/schema-engine`, in `database/migrations.ts` and the `db:init` command. At boot, `checkMigrationDrift` warns when the database is behind the chain. `packages/astromech/tests/database/drift.test.ts` checks the committed demo snapshot against the core tables.

## Plugins

A plugin is a separate npm package that registers tables, routes, service methods, hooks, cron jobs and admin pages through its `PluginContext` (`ctx`). `ctx` is the `AppContext` every method receives (the content services, `ctx.db`, `ctx.email`, `ctx.database`, `ctx.methods`, `ctx.runHook`, `ctx.env`), plus the plugin layer: `ctx.plugin` (its identity), `ctx.storage` (keys prefixed `plugin/<alias>/`), `ctx.plugins` (other plugins' services, when any are registered) and `ctx.config`, an allow-listed view of the resolved config. The types are in `types/app-context.ts` and `types/plugins.ts`.

### Plugin runtime boundary

A plugin imports only published `astromech` subpaths that load in plain Node, such as `astromech`, `astromech/fields`, `astromech/columns`, `astromech/email` and `astromech/ui`, and never `@astromech/admin`. The site's `astromech.config.ts` is evaluated twice: once in plain Node at config time (route registration, codegen, migrations) and once in the Vite SSR graph that serves requests. `virtual:` modules exist only in the second. `astromech/ui/app` reaches them, so only a plugin's source-shipped `./admin/*` components may import it, never its entry. `pnpm run check:node-imports` imports core's plugin-facing subpaths and every published plugin's entry in plain Node.

The plugin runtime registers hooks into `hooks/`, the one hook runner. A hook handler's throw propagates to the caller.

## The browser boundary

The admin runs in the browser and reaches core through three entries only: `astromech/shared` (browser-safe values), `astromech/fetch` (the fetch client), and type-only imports from `astromech`. A service or driver would pull the config and every backend into the client bundle, so a lint rule refuses any other core import from `packages/admin/src/`. The site's Vite aliases `astromech/shared`, `astromech/fetch` and `astromech/ui*` to source, so every browser caller shares one instance of each. It resolves core's `@/` specifiers only for files inside core's `src`, so a site's own `@/` paths reach the site.

`packages/astromech/tests/exports/shared-browser.test.ts` bundles the two entries for the browser and fails on a Node builtin or on a core file outside its allowlist. `pnpm run check:boot` loads the built admin in a headless browser.

## Scheduler

Cadence lives in the `_astromech_cron` table, not in deploy config, so an admin edit takes effect on the next tick. A `SchedulerDriver` only triggers a tick; `cron/runner.ts` decides which jobs are due and runs each in its own try/catch. The table is also the lock against concurrent ticks.

## Public entry points

Consumers import subpaths, never deep into `src/`. `exports` in `packages/astromech/package.json` is the list; `publishConfig.exports` is what npm gets, and `pnpm run check:exports` keeps the two in step. In the repo nearly every subpath resolves to `dist/`, so a core change needs `pnpm run build` before `apps/demo` sees it. Three point at source: `./middleware` (in the repo only), and `./routes/handler.ts` and `./media/Image`, which the site's Vite compiles in both maps. The package also ships the `astromech` CLI bin.
