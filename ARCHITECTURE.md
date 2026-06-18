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
(S3-compatible) storage. Other drivers exist (libsql, filesystem) but Cloudflare
is the shape decisions are made for. **SSR only** for now.

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

The three first-party plugins (`@astromech/{seo,redirects,menus}`) live OUTSIDE
this `src/` graph, in `packages/plugins/` — each a separately published npm
package that consumes core only through the public `astromech` surface (incl.
`astromech/plugin-kit`, the plugin-authoring API). They prove the public surface
can build a real plugin; cross-package isolation is enforced by each package's
`exports` boundary at publish time. The plugin **runtime** (hook engine) stays a
core capability.

Key invariants:

- **Domains are deep modules named for the business, not the tech.** Each owns its
  `service.ts`, `schema.ts` (Drizzle table + Zod validation), `descriptors.ts`,
  and `visibility.ts`. Cross-domain data goes through `@/database/schema` (the
  table aggregator) or a shared capability — never via a direct peer import. The
  only permitted exception is a `schema.ts` foreign-key cross-reference.
- **Capabilities sit below domains.** They expose primitives (`storage`, `database`,
  `fields`, `permissions`, `context`, `email`, `cron`) and may not orchestrate
  domain logic.
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
│   │   ├── database/       # Drizzle client/drivers + schema.ts aggregator (was db/; public subpath unchanged)
│   │   ├── storage/        # file-storage drivers (R2, filesystem)
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
│   ├── drizzle/
│   └── (tsup|vitest|drizzle).config.ts · tsconfig*.json · .dependency-cruiser.cjs
│
└── plugins/         # first-party plugins as separate published packages
    ├── menus/       # @astromech/menus
    ├── redirects/   # @astromech/redirects  (ships a ./schema subpath for drizzle)
    └── seo/         # @astromech/seo        (admin React components ship as source via ./admin/*)

apps/
├── demo/            # demo Astro site (was demo/ at root) — deployed, not published
└── docs/            # documentation markdown (was docs/ at root) — will become an Astro site
```

## Public entry points

Consumers import from subpaths, never deep into `src/`. The published surface is
defined by `exports` in `package.json` — that's canonical. The ones to know:
`astromech` (core helpers + types), `astromech/astro` (integration),
`astromech/local` & `astromech/fetch` (the two API consumers), `astromech/middleware`,
`astromech/fields`, `astromech/db/schema`, `astromech/plugin-kit` (the
plugin-authoring API), and the `astromech` CLI bin. The first-party plugins are
their own packages — `@astromech/{seo,redirects,menus}` (see `packages/`).

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
