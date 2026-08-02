# Astromech Architecture

A development-orientation map for working **on the CMS** — where things live and
the invariants to hold. It is deliberately thin: the canonical detail lives in
the code, the types (`packages/astromech/src/types/`), and the design docs (`specs/`). When this
file and the code disagree, the code wins — fix this file.

> User-facing guides (configuring a project, modelling content, writing plugins)
> belong in `apps/docs/`, not here.

## What it is

Astromech is a lightweight TypeScript CMS. It ships as a framework-agnostic core
plus an Astro integration that injects the admin SPA, an HTTP API, and a
type-safe client for reading content in templates.

**Infrastructure target:** Cloudflare — Workers runtime, D1 (SQLite) database, R2
(S3-compatible) storage. Other drivers exist (libsql, filesystem, s3) but
Cloudflare is the shape decisions are made for. **SSR only** for now. The D1
driver is not built yet (`roadmap/planned/additional-database-drivers.md`), and
nothing has been run on Workers.

## The layer model

The source is a modular screaming-architecture DAG. Imports may only point
**down** this list; upward edges are forbidden, and peer domains may never import
one another:

```
routes · admin · kernel · codegen · cli        entrypoints & composition root
client                                         consumes the HTTP API over the wire
transport (http · local · mcp · cli)           delivery
policies                                       permission/confirmation wrappers (withPermissions)
entries · media · users · settings             domains — siblings, never import each other
plugins/runtime · database · storage ·         capabilities
  email · cron · context · fields · permissions
types · utilities · errors                     pure leaves
```

The four first-party plugins (`@astromech/{seo,redirects,menus,backups}`) live
OUTSIDE this `src/` graph, in `packages/plugins/` — each a separately published
npm package that consumes core only through the public `astromech` surface. The
plugin-authoring API (`definePluginTable`, `createStorage`, codec helpers,
descriptor type vocabulary, …) is part of the root `astromech` export, not a
separate subpath — the standalone `astromech/plugin-kit` package was dissolved. They
prove the public surface can build a real plugin; cross-package isolation is
enforced by each package's `exports` boundary at publish time. The plugin
**runtime** (hook engine) stays a core capability.

Key invariants:

- **Domains are deep modules named for the business, not the tech.** Each owns its
  `service.ts`, `schema.ts` (`defineTable` table descriptor + Zod validation), `descriptors.ts`,
  and `visibility.ts`. Cross-domain data goes through `@/database/schema` (the
  table aggregator) or a shared capability — never via a direct peer import. The
  only permitted exception is a `schema.ts` foreign-key cross-reference.
- **Capabilities sit below domains.** They expose primitives (`storage`, `database`,
  `fields`, `permissions`, `context`, `email`, `cron`, `cloudflare`) and may not
  orchestrate domain logic.
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

(`core/`, `sdk/`, `api/` no longer exist; they were dissolved in the 2026-06
refactor. Published subpaths were unchanged.)

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
│   │   ├── middleware.ts   # HTTP middleware entry     (astromech/middleware)
│   │   │
│   │   │   ── entrypoints & composition root ──────────────────────────────────
│   │   ├── kernel/         # composition root — boots & wires all layers; Astro integration (astromech/astro)
│   │   ├── routes/         # 3 Astro APIRoute entrypoints injected by the integration (api / auth / media)
│   │   ├── admin/          # React admin SPA (TanStack Router; deep-imports a few pure domain leaves)
│   │   ├── codegen/        # type generator + plugin-client manifest + method manifest (.astro/astromech.methods.json)
│   │   │
│   │   │   ── over-the-wire client ─────────────────────────────────────────
│   │   ├── client/         # fetch Client (astromech/fetch) — talks HTTP, no server imports
│   │   │
│   │   │   ── delivery ────────────────────────────────────────────────────
│   │   ├── transport/      # local/ (astromech/local) · http/ (Hono routes+middleware) · cli/ · mcp/
│   │   │
│   │   │   ── policies ───────────────────────────────────────────────────
│   │   ├── policies/       # withPermissions wrapper only — no domain logic here
│   │   │
│   │   │   ── plugin runtime (capability) ──────────────────────────────────
│   │   ├── plugins/        # plugins/runtime (hook engine) only — first-party plugins live in packages/plugins/
│   │   │
│   │   │   ── domains ────────────────────────────────────────────────────
│   │   ├── entries/        # entries domain: service · schema · descriptors · visibility · url · type-registry
│   │   ├── media/          # media domain: service · schema · serving/image/
│   │   ├── users/          # users domain: service · schema · auth (Better Auth integration)
│   │   ├── settings/       # settings domain: service · schema · page-values
│   │   │
│   │   │   ── capabilities ───────────────────────────────────────────────
│   │   ├── database/       # Kysely client/drivers + schema.ts aggregator (was db/; public subpath unchanged)
│   │   ├── storage/        # blob-storage registry + drivers/ (filesystem, r2, s3)
│   │   ├── cloudflare/     # binding-name resolution across Workers and Node
│   │   ├── permissions/    # permission model: roles, grammar, BUILT_IN_ROLES, can()
│   │   ├── fields/         # field/column builder, formatters, rich-text, helpers
│   │   ├── context/        # shared server request-context (was services/_shared/)
│   │   ├── email/          # email drivers
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
    ├── backups/     # @astromech/backups     (ships a ./tables subpath of plain table descriptors)
    ├── forms/       # @astromech/forms
    ├── menus/       # @astromech/menus
    ├── redirects/   # @astromech/redirects  (ships a ./tables subpath of plain table descriptors)
    └── seo/         # @astromech/seo        (admin React components ship as source via ./admin/*)

apps/
├── demo/            # demo Astro site (was demo/ at root) — deployed, not published
└── docs/            # documentation markdown (was docs/ at root) — will become an Astro site
```

## Plugin capability ports

Plugins access platform resources through two sanctioned, plugin-scoped handles on `PluginContext`:

- **`ctx.storage`** — a plugin-scoped view of the storage registry. Keys are auto-prefixed `plugin/<alias>/` on `put`/`get`/`delete` and de-prefixed on `list()`. Plugins never see or construct raw storage keys.
- **`ctx.database`** — `{ dialect, dump?, restore? }`. `dump` and `restore` are optional and feature-detected from the driver. Code against their presence, not the dialect. Backed by the **driver registry** (`src/database/driver-registry.ts`), which retains the full `DatabaseDriver` object alongside the Kysely instance.

**`DatabaseDriver` capability seam:** `dump?()` and `restore?()` are optional fields on `DatabaseDriver` (`src/types/config.ts`). Implemented for libsql (local `file:` connections only — `VACUUM INTO` requires a local path); unimplemented on D1/Postgres drivers (feature-detects off). A driver may implement `dump` without `restore`.

## App-owned migration model

Migrations are an **app artifact**, not a core artifact. Core ships schema definitions and types; it does not ship migration files.

- `astromech db:generate` — diffs the core `defineTable` descriptors (`CORE_TABLES`) against the app's `migrations/snapshot.json` (a homegrown snapshot/diff generator, not drizzle-kit — see `src/database/{diff,generator,migration-render}.ts`) and, if anything changed, writes a new `NNNN_<name>.ts` migration + regenerates `migrations/index.ts`'s static `MigrationProvider`. Output lands in the **app's** `migrations/` folder (e.g. `apps/demo/migrations/`). No-op prints "no changes" — this doubles as a CI drift gate.
- `astromech db:init` / `runMigrations` — resolve migrations from the **app cwd's** `./migrations/index.ts`, not the core package folder, and apply them via Kysely's `Migrator`.
- Plugin-owned tables are not yet generated for (single-scope core generation only) — see `roadmap/in-progress/table-definition-system.md`.

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
`astromech/local` & `astromech/fetch` (the two API consumers), `astromech/middleware`,
`astromech/fields`, `astromech/db/schema`, `astromech/storage/{filesystem,r2,s3}`
(storage drivers), `astromech/cloudflare` (binding-name resolution), and the
`astromech` CLI bin. The first-party plugins are their own packages —
`@astromech/{seo,redirects,menus,backups}` (see `packages/`).

## The development gate

Before a change lands, all of these pass. The husky pre-commit hook runs
lint-staged (eslint --fix + prettier) on touched files; `--no-verify` is not
used.

| Command             | Checks                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` | `tsc -p tsconfig.test.json` (delegates to `packages/astromech`)                                                                                 |
| `npm run test:run`  | vitest; tests live in `packages/astromech/tests/` mirroring `src/`                                                                              |
| `npm run build`     | tsup (explicit entries, dts). DTS worker can OOM — bump `NODE_OPTIONS=--max-old-space-size`.                                                    |
| `npm run lint:deps` | dependency-cruiser — enforces the modular DAG invariants within `packages/astromech/src` (no upward edges, no peer-domain imports, pure leaves) |

For refactors that move tables, `npm run db:generate` must also report "No
schema changes" (migration-neutrality).

## Further reading

- **`apps/docs/`** — user-facing guides (currently plugin authoring); grows over time.
- **`packages/astromech/src/types/`** — the data model, config shape, field/permission/hook types.
  If you want the precise contract, read these rather than prose.
- **`.claude/skills/code`** — coding conventions (naming, TS rules, imports).

> `specs/` holds in-flight design notes for unbuilt work; they're deleted once a
> feature ships, so treat them as scratch — never link to them as a reference.
