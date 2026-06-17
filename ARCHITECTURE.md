# Astromech Architecture

A development-orientation map for working **on the CMS** — where things live and
the invariants to hold. It is deliberately thin: the canonical detail lives in
the code, the types (`src/types/`), and the design docs (`specs/`). When this
file and the code disagree, the code wins — fix this file.

> User-facing guides (configuring a project, modelling content, writing plugins)
> belong in `docs/`, not here.

## What it is

Astromech is a lightweight TypeScript CMS. It ships as a framework-agnostic core
plus an Astro integration that injects the admin SPA, an HTTP API, and a
type-safe client for reading content in templates.

**Infrastructure target:** Cloudflare — Workers runtime, D1 (SQLite) database, R2
(S3-compatible) storage. Other drivers exist (libsql, filesystem) but Cloudflare
is the shape decisions are made for. **SSR only** for now.

## The layer model

The source is organised as a one-way dependency stack, assembled at the kernel:

```
storage → services → policies → transport → Client      (composed at the kernel)
```

- **storage** — persistence; knows data, not rules.
- **services** — capability verbs (`entries.create`, …), feature-split; bare
  functions unaware of how they're delivered.
- **policies** — composable wrappers *over* services (permissions). Visibility is
  **not** here — it's per-feature read-shaping in `services/<feature>/visibility.ts`.
- **transport** — projections of the service methods per consumer (local, HTTP,
  CLI; MCP later). Internal word; public names are Local API / HTTP API / CLI.
- **Client** — the over-the-wire consumer; the fetch Client mirrors the Local API 1:1.

**The invariant to hold sacred:** dependencies only ever point *up* this stack —
no upward edges, graph stays acyclic. Enforced by `.dependency-cruiser.cjs`
(`npm run lint:deps`). (`core/`, `sdk/`, `api/` no longer exist; they were
dissolved into this model in the 2026-06 refactor. Published subpaths were
unchanged.)

## Directory map

```
src/
├── index.ts        # framework-agnostic entry: defineConfig / defineEntryType /
│                   #   definePlugin / defineAdminPage / defineServiceMethod / defineHook
├── fields.ts       # field factories          (astromech/fields)
├── columns.ts      # column factories         (astromech/columns)
├── middleware.ts   # HTTP middleware entry     (astromech/middleware)
├── kernel/         # composition root — boots & assembles the layers; Astro integration (astromech/astro)
├── storage/        # db schema/drivers/registry, file drivers, entry storage
├── services/       # entries · media · users · settings · _shared  (capability verbs)
├── policies/       # permissions/ — composable wrappers over services
├── transport/      # local/ (astromech/local) · http/ (Hono routes+middleware) · cli/ (bin: astromech)
├── client/         # the fetch Client (astromech/fetch)
├── codegen/        # type generator + plugin-client manifest
├── plugins/        # plugin runtime + first-party plugins (redirects, seo, menus)
├── admin/          # React admin SPA (TanStack Router; holds the Client)
├── auth/           # Better Auth integration
├── builders/       # field/column builder internals
├── routes/         # route-handler entrypoints (auth / api / media)
├── images/ email/ cron/   # infrastructure modules (used by services + kernel)
├── utilities/      # pure helpers (strings, dates, entry-fields, rich-text, permission-match, …)
└── types/          # shared TS types — the source of truth for the data model & config shape
```

## Public entry points

Consumers import from subpaths, never deep into `src/`. The published surface is
defined by `exports` in `package.json` — that's canonical. The ones to know:
`astromech` (core helpers + types), `astromech/astro` (integration),
`astromech/local` & `astromech/fetch` (the two API consumers), `astromech/middleware`,
`astromech/fields`, `astromech/db/schema`, the `astromech` CLI bin, and the
first-party plugins under `astromech/plugins/*`.

## The development gate

Before a change lands, all of these pass (commits to this repo use `--no-verify`
because of pre-existing eslint/prettier debt — the gate below is the real bar):

| Command | Checks |
| --- | --- |
| `npm run typecheck` | `tsc -p tsconfig.test.json` (src + tests) |
| `npm run test:run`  | vitest; tests live in `tests/` mirroring `src/` |
| `npm run build`     | tsup (explicit entries, dts). DTS worker can OOM — bump `NODE_OPTIONS=--max-old-space-size`. |
| `npm run lint:deps` | dependency-cruiser — enforces the layer invariant above |

## Further reading

- **`docs/`** — user-facing guides (currently plugin authoring); grows over time.
- **`src/types/`** — the data model, config shape, field/permission/hook types.
  If you want the precise contract, read these rather than prose.
- **`.claude/skills/code`** — coding conventions (naming, TS rules, imports).

> `specs/` holds in-flight design notes for unbuilt work; they're deleted once a
> feature ships, so treat them as scratch — never link to them as a reference.
