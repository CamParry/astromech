# Astromech Architecture

Where the parts live and what may import what. Paths are under `packages/astromech/src/` unless they start with a top-level folder.

## What it is

- A framework-agnostic core plus an Astro integration, which injects the admin SPA, an HTTP API and a middleware that boots the application on the first on-demand request. A prerendered page boots nothing.
- SSR only, on Node and on Cloudflare Workers; every backend has a driver for each.

## Repository layout

```
packages/             # published to npm
├── astromech/        # the `astromech` core package
├── admin/            # @astromech/admin: the admin app, the component kit and its Vite helper
├── schema-engine/    # @astromech/schema-engine: table diffing and DDL rendering
└── plugins/          # first-party plugins, one package each:
                      # assistant · backups · forms · menus · redirects · seo
apps/                 # never published
├── demo/             # the site to run and browser-verify against, on Node
├── demo-cloudflare/  # the same core on Workers: D1, R2, Cron Triggers
└── docs/             # user-facing documentation
```

## The layer model

One directory per module. Imports point down this list; modules on one line may import one another. Nothing enforces it.

```
integrations · transport/cli · transport/mcp         process entry points, each boots the application
astromech.ts · register-drivers.ts ·                 composition root
  plugins/runtime/plugin-runtime.ts · app-context/
transport (http · tools)                             delivery
codegen                                              generation
policies                                             who may call what
entries · globals · media · users ·                  content modules, and what four of them share
  notifications · content
auth · security                                      beside the content modules
plugins · config · database · storage · fields ·     what those build on
  permissions · hooks · request-scope · email ·
  ai · cron
types · services · utilities · errors ·              pure leaves
  env.ts · registry.ts
```

- **Composition root.** `createAstromech` (`astromech.ts`) resolves the config, calls `registerDrivers` (`register-drivers.ts`, also called by the CLI and the test harness) and composes the services. `createPluginContext` (`plugins/runtime/plugin-runtime.ts`) builds a plugin's `ctx`. `createAppContext` (`app-context/app-context.ts`) builds the `AppContext` a method receives: one per request, plus one cached system context (no user, no role) for the CLI, cron and plugin `setup()`. `createServices` (`app-context/services.ts`) builds a context's service handles, trusted or scoped (`{ overrideAccess: false }`).
- **Upward imports.** `policies/call-method.ts`, the HTTP routes and `media/serving/handler.ts` import `app-context/`, which forms a cycle with `policies/scoped-services.ts` and `plugins/runtime/`.
- **`exports/`**: one barrel per published subpath. It and `types/index.ts` are the only barrels.
- **`integrations/`**: `astro/` is the framework integration (Vite config, virtual modules, routes, boot middleware); `cloudflare/` is the runtime integration (Worker entry, bindings).
- **`transport/`**: `http/` (Hono; the auth middleware sets `c.var.ctx`), `cli/`, `mcp/` (dev only) and `tools/` (the tool surface MCP and the AI tool-loop share). No business logic.
- **`policies/`**: `scoped-services.ts` wraps a context's services and plugin methods in permission checks, the one place a method call is checked. The check itself is `permissionsFor` (`permissions/permissions-for.ts`), which a plugin's raw routes and a REST route's early refusal also call. Untrusted callers (REST, RPC, plugin RPC, the AI tool-loop) use the scoped handle; trusted ones (SSR, hooks, `ctx.plugins`, CLI, MCP) the raw services. A call by manifest id goes through `callMethod` (`call-method.ts`).
- **`auth/`**: better-auth wiring, sessions, first-run setup and better-auth's tables. Imports `users` and `security`; `users` never imports `auth`.
- **`security/`**: sign-in failures, the account lock, and the block and allow lists. `auth` calls it from better-auth's hooks; the Hono app and the Astro middleware check addresses with it.
- **Lower modules** hold no business logic. `plugins/` here is the `define*` API and `plugins/runtime/` except `plugin-runtime.ts`.
- **Leaves** import only leaves and third-party packages, plus type-only schema imports in `types/`. A small pure file may sit in any module and be imported from any layer.

### Content modules

- `entries`, `globals`, `media`, `users` and `notifications` own the business verbs. Each has `service.ts` (a `defineService` over `methods/`), `service-types.ts`, `tables.ts` and `schema.ts` (request and output schemas; `types/domain.ts` infers public types from the output schemas).
- A file in `methods/` exports one `defineServiceMethod`. The method manifest, the scoped services, the REST mount and `policies/permission-catalogue.ts` all read these. `entries/catalogue.ts` builds one catalogue per entry type.
- `internal/` is private to its module (lint).
- Handlers take the user, config, hooks and sibling services from `ctx`. Lint stops the content modules, `security` and `content` importing the request scope, `config/registry.ts`, `hooks/hooks.ts` or `app-context/services.ts`, except files listed in `eslint.config.js`.
- `defineService.bind()` checks the method's `requires` capability, parses input, and parses the result through the output schema.
- A content module may call another's service; it reaches other tables through `database/tables.ts`.
- `content/` is what entries, globals, media and users share: the resource repositories, versioning, translation and visibility helpers, the write guard, the relationship index (`astromech index:rebuild`), stored-content validation (`astromech validate`) and the `scheduled-publish` job.

## The admin package

- `@astromech/admin`: the React SPA, the component kit behind `astromech/ui`, and a Vite helper. It ships as source and the site's Vite compiles it.
- Core depends on it, so a site installs core alone. `packages/admin/AGENTS.md` has the rest.

## The environment

- Every environment read goes through `env.ts` (`resolveEnv`, and `getEnvRecord` for `ctx.env`).
- A runtime integration sets the source with `setEnvSource`; the Worker entry passes its `env`. `integrations/cloudflare/bindings.ts` resolves bindings.
- Under `astro dev`, the middleware passes `viteEnv` from `virtual:astromech/config` to `setViteEnvSource`. Core reads `import.meta.env` nowhere else; the admin reads only `import.meta.env.DEV`.

## Drivers and registries

A **driver** is a plain object the site config names and core calls through a fixed interface.

| Backend   | Drivers                                 | Source                                                                 |
| --------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Database  | `libsql`, `d1`                          | `database/drivers/`                                                    |
| Storage   | `filesystem`, `s3`, `r2`                | `storage/drivers/`                                                     |
| Email     | `consoleEmail`, `resend`, `smtp`        | `email/drivers/`                                                       |
| Scheduler | `interval`, `webhook`, `cloudflareCron` | `cron/drivers/`, published as `astromech/scheduler/*`                  |
| Images    | `sharp`, `cloudflareImages`             | `media/serving/image/drivers/`, published as `astromech/media/image/*` |

- AI models follow the same pattern (`ai/`). Optional driver methods (`dump`, `restore`) are feature-detected.
- Each module keeps its driver in a **registry** built on `registry.ts`, over the one `globalThis.__astromech` namespace. No module-scope singletons.
- Config is read with `getConfig()` (`config/registry.ts`) at call time.
- A repository (`userRepository`) is a stateless module-level object.

## Entries and fields

- An **entry type** is declared with `defineEntryType`; its features live in `entries/methods/`.
- Callers pass the entry id, with locale as a separate parameter.

### Resources

- Entries, globals, media items and users each have a resource row (shared across locales), a content row per locale (with `fields` as JSON) and a versions table. Entries and globals also have a drafts table (`entry_drafts`, `global_drafts`), one row per resource and locale. Each resource defines its content columns once in its `tables.ts`, and the content, versions and drafts tables share them.
- `content/repository/drafts.ts` reads and writes both drafts tables.
- `content/repository/versions.ts` writes all four versions tables; `content/versions.ts` lists, reads and restores. A version is addressed by resource, locale and number.
- `RESOURCE_CONFIG` (`content/resources.ts`) describes each resource to the shared helpers. Outside `content/`, code names the resource (`'user'`) instead (lint).
- **Entries** (`entries/tables.ts`) hold every entry type, the site's and each plugin's.
- **Media** (`media/tables.ts`): file bytes live in the storage driver. No statuses, staging or trash.
- **Users** (`users/tables.ts`): better-auth owns the `users` row; its sessions and accounts are in `auth/tables.ts`.
- References to `users` declare `onDelete`. The migration runner refuses a database that does not enforce foreign keys.

### Fields

- `fields/builder.ts` is the authoring API; `fields/field-type-registry.ts` holds one `FieldType` per type name, core or plugin.
- `fields/traverse.ts` is the one walk over a schema. Callers ask each field's type rather than branching on type names.
- `fields/parse-fields.ts` runs coerce, default, validate. Every resource write reaches it through `prepareFields` (`content/prepare-fields.ts`).
- The request's Zod parse is `parseInput` (`errors/validation.ts`).

## Database and migrations

- `database/` wraps Kysely. Core tables use `defineTable`, gathered in `database/tables.ts`; plugin tables use `definePluginTable`.
- `astromech db:generate` diffs the tables against `snapshot.json` in the config's `migrationsDir` and writes a migration and an `index.ts` exporting the chain as a Kysely `MigrationProvider`. The config imports it as `migrations`.
- `astromech plugin:generate` writes a plugin's chain. `database/migrations.ts` merges them with `mergeMigrationProviders` from `@astromech/schema-engine`.
- `database/app-migrations.ts` checks the chain against `journal.json` before it is applied. At boot, `checkMigrationDrift` warns when the database is behind, and `database/migration-registry.ts` holds the merged chain.
- `packages/astromech/tests/database/drift.test.ts` checks the demo snapshot against the core tables.

## Plugins

- A plugin is an npm package that registers tables, field types, routes, service methods, hooks, cron jobs, admin pages and admin resources through its `PluginContext` (`ctx`): the `AppContext` plus `ctx.plugin`, `ctx.storage`, `ctx.plugins` and `ctx.config`. Types: `types/plugins.ts`.
- `plugins/define-plugin.ts` turns a definition into the factory a site calls, carrying `permissions(...)` and the plugin's `helpers`.
- Admin resources (`plugins/admin-resource.ts`) are checked in `plugins/runtime/plugin-resources.ts` and rendered from `packages/admin/src/components/admin-resources/`.
- A plugin's entry types and globals resolve into `ResolvedConfig.entryTypes` and `ResolvedConfig.globals` beside the site's, keyed `<namespace>/<name>` (`config/entry-types.ts`, `config/globals.ts`).

### Plugin runtime boundary

- A plugin imports only published `astromech` subpaths that load in plain Node, and never `@astromech/admin`. Everything else arrives on `ctx`.
- `astromech.config.ts` is evaluated twice: in plain Node at config time, and in the Vite SSR graph. `virtual:` modules exist only in the second, so only a plugin's source-shipped `./admin/*` components may import `astromech/ui/app`.
- `pnpm run check:node-imports` imports core's plugin-facing subpaths and each plugin's entry in plain Node.
- Plugin hooks register into `hooks/hooks.ts`, the one hook runner. A hook runs as the context that fired it; a handler's throw propagates.

## The browser boundary

- The admin reaches core only through `astromech/shared`, `astromech/fetch` and type-only imports from `astromech`. A lint rule refuses any other core import from `packages/admin/src/`.
- In the site's Vite, `astromech:core-source-alias` resolves core to source and the admin's Vite helper aliases `astromech/ui*` to the admin's source, so each browser entry loads once.
- `packages/astromech/tests/exports/shared-browser.test.ts` bundles the two entries and fails on a Node builtin or a core file outside its allowlist. `pnpm run check:boot` loads the built admin in a headless browser.

## Scheduler

- Job schedules come from config. Each tick syncs them into the `_astromech_cron` table, which holds run state and the claim that keeps concurrent ticks from running a job twice.
- A `SchedulerDriver` only triggers a tick; `cron/runner.ts` runs due jobs with the system `AppContext` and records each result.

## Public entry points

- Consumers import subpaths, never `src/`. `exports` in `packages/astromech/package.json` is the list, `publishConfig.exports` is what npm gets, and `pnpm run check:exports` keeps them in step.
- In the repo most subpaths resolve to `dist/`, so plain Node sees a core change only after `pnpm run build`. `./middleware` (repo only), `./routes/handler.ts` and `./media/Image` point at source.
- In the site's Vite, `astromech:core-source-alias` (`integrations/astro/core-source-alias.ts`) resolves every other subpath to `src/exports/`, so a server bundle holds one copy of core; `check:boot:cloudflare` fails on a second.
- The package ships the `astromech` CLI bin.
