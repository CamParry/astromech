# Modular Architecture Refactor

**Status:** design complete, unbuilt. This is the implementation contract for a structural
refactor of `src/`. Behaviour must not change — it's a `/refactor`, not a feature.

> Spec is ephemeral (see memory `specs-are-ephemeral`): delete it once the refactor ships.
> Don't link to it from durable docs/code.

---

## 1. Why

The current layout is **layer-first** (`storage/ services/ policies/ transport/ client/`,
assembled at `kernel/`). It works, but a single domain is smeared across many top-level dirs:
media's logic is in `services/media`, its permissions in `policies/`, its image pipeline in
`images/`, its serving route in `routes/`. `utilities/` and `types/` have become grab-bags where
domain logic hides. You can't see "all of media" in one place.

## 2. Target model

A **DAG of deep modules**, partitioned by **domain** at the top level (screaming architecture),
with layering preserved as **dependency direction**, not as the folder taxonomy. Each module is a
deep module: rich internals, one small public surface (`index.ts`). Dependencies flow strictly
downward; **peer domains never import each other**.

```
tier                              members                         may import
────────────────────────────────────────────────────────────────────────────────
public surface (pkg boundary)     exports/                        anything (curated re-export)
consumers                         client/  admin/                 exports / client only
layers above (wrap & compose)     transport/ policies/ kernel/ codegen/   domains + below
domain modules (SCREAM)           entries/ media/ users/ settings/        shared-core + capabilities
shared core (domain-agnostic)     fields/  errors/                capabilities only
capabilities (no domain)          database/ storage/ email/ cron/         (leaf)
extension (own packages, Stage 4) packages/{seo,redirects,menus}/  exports only
```

Guiding principles (from Ousterhout deep modules + Martin screaming architecture + Pocock scope rule):

- **Folders name the domain, not the tech.** `media/`, not `services/`.
- **`index.ts` is the sole public surface of a module.** Everything else is private-by-convention;
  consumers import the folder, never a deep path.
- **Types/logic live at the narrowest boundary that contains their consumers** — drain the central
  `utilities/`/`types/` grab-bags into the module that owns the logic.
- **Transport is the only caller for delivery.** Modules expose surfaces; they never wire themselves
  to HTTP/CLI/local. Even bespoke domain behaviour (e.g. media binary serving) is _logic the
  transport layer invokes_ — the route lives in transport.
- **Bespoke domain behaviour → module; uniform machinery → layer above.** Permissions/visibility
  (bespoke) move into the module; CRUD route projection (uniform, generated from descriptors) stays
  in transport.
- **Sub-modules when things clearly belong together** (e.g. `media/serving/image/`). Layering _inside_
  a module is fine and expected — just don't leak it through the surface.
- **Resist premature packaging** (anti-classitis). First-party domains are _core modules_, not
  plugins; they only share the module _shape_.

## 3. Naming & organisation conventions

- Folder = the domain, kebab-case. Plural for collections (`entries`, `users`), singular for
  concepts/singletons (`media`, `settings`, `fields`).
- Role-based filenames, identical across every module: `service.ts` (deep core), `schema.ts`
  (drizzle table + validation), `descriptors.ts` (method descriptors), `permissions.ts`,
  `visibility.ts`, `types.ts` (module-internal types), `drivers/` (pluggable impls).
- **Drop the redundant domain prefix once inside the module** — `fields/formatters.ts`, not
  `fields/field-formatters.ts`. The folder is the namespace.
- Sub-areas become folders when a concern has real internal depth (`media/serving/`).
- Code style per the `code` skill: kebab files, PascalCase types, camelCase vars, `type` over
  `interface`, `import type`, named exports only, no `any`, no `enum` (union types), `@/` aliases.

## 4. The public `exports/` layer (Stage 1 — the keystone)

The package is itself a deep module: small public surface, everything else private. Today that's
violated — `demo/seed.ts` & `scripts/seed.ts` import `../src/db/schema.js`, and several published
subpaths resolve straight to raw internal files (`astromech/db/schema` → raw `schema.ts`;
`./Image` & `./admin/shell.astro` → raw `src/` `.astro`).

**`src/exports/`** becomes the entire public contract — thin re-export barrels pulling from private
modules. Everything else in `src/` is private.

```
src/exports/
  index.ts          → astromech                (defineConfig, defineEntryType, definePlugin, …)
  astro.ts          → the Astro integration     (was kernel/astro via sdk entry)
  local.ts  fetch.ts→ Local API / Client SDK
  middleware.ts     → Hono middleware
  fields.ts columns.ts → userland-safe subset of fields/
  schema.ts         → curated drizzle schema for migrations (NOT raw internal aggregate)
  email.ts
  storage-r2.ts  image-sharp.ts  image-cloudflare.ts   ← per-driver barrels stay SEPARATE
                                                          (tree-shaking: import one, bundle one)
  admin/...         → ui, ui/fields, ui/layout barrels
  # .astro public files (Image, admin shell) relocate to a public location & re-point exports
```

Rules that make the boundary real:

- **`package.json` `exports` + `tsup.config.ts` entries point ONLY at `src/exports/`** (and the
  public `.astro` files). Node refuses any other subpath for published consumers.
- **`demo/` and `scripts/` import the package surface** (`astromech/…` or `dist/`), never
  `../src/...`. Repoint `demo/seed.ts`, `scripts/seed.ts`, `demo/drizzle.config.ts`,
  `drizzle.config.ts`.
- **A dependency-cruiser rule forbids `demo/` & `scripts/` from reaching `src/` internals** —
  catches the in-repo drilling Node's exports map can't.
- Driver entries stay separate barrels (no bundling `sharp` when you import `r2`).

Stand this up **over the current structure first**, so the public contract is frozen before any
internal file moves. Every later stage just re-points the barrels inward — invisible downstream.

## 5. Full path map (current → target)

### Domain modules

```
entries/
  index.ts                         (new surface)
  service.ts        ← services/entries/service.ts
  schema.ts         ← services/entries/schema.ts   (+ entry tables out of db/schema.ts)
  visibility.ts     ← services/entries/visibility.ts
  permissions.ts    ← entries' slice of policies/permissions/permissions.ts
  scoped-entries.ts ← services/_shared/scoped-entries.ts
  types.ts          ← entries' slice of types/domain.ts
  url.ts            ← utilities/entry-url.ts
  type-registry.ts  ← utilities/entry-types.ts            (rename: drop redundant prefix)
  errors.ts         ← errors/entry-type-mismatch.ts + errors/bulk-operation.ts
  storage/          ← storage/entries/* (built-in, capabilities, registry, table, types)
  data/             ← db/repositories/* (populate, relationships, versions)
  jobs/             ← cron/jobs/* (scheduled-publish, trash-purge)

media/
  index.ts
  service.ts        ← services/media/service.ts
  schema.ts         ← services/media/schema.ts
  descriptors.ts    ← services/media/descriptors.ts
  permissions.ts    ← media's slice of policies/permissions
  serving/
    handler.ts      ← images/handler.ts (handleMediaRequest / MediaRequestInfo)
    image/          ← images/{build-image-attrs,defaults,dimensions,url,version,registry}.ts, Image.astro
      drivers/      ← images/drivers/{sharp,cloudflare}.ts

users/
  index.ts
  service.ts        ← services/users/service.ts
  schema.ts         ← services/users/schema.ts
  descriptors.ts    ← services/users/descriptors.ts
  permissions.ts    ← users' slice of policies
  auth/             ← auth/index.ts (better-auth integration/config ONLY; the route → transport)

settings/
  index.ts
  service.ts        ← services/settings/service.ts
  schema.ts descriptors.ts visibility.ts ← services/settings/*
  permissions.ts    ← settings' slice of policies
  page-values.ts    ← utilities/settings-page-values.ts
```

### Shared core

```
fields/
  index.ts          ← src/fields.ts (module surface; public export via exports/fields.ts)
  builder.ts        ← builders/fields.ts
  columns.ts        ← src/columns.ts + builders/columns.ts   (columns folded INTO fields)
  types.ts          ← types/fields.ts
  formatters.ts     ← utilities/field-formatters.ts
  helpers.ts        ← utilities/{field-helpers,entry-fields,field-count}.ts  (consolidate)
  rich-text/        ← utilities/{render-rich-text,rich-text-extensions}.ts

errors/             ← keep index.ts + validation.ts; capability.ts → storage/;
                      entry-type-mismatch.ts + bulk-operation.ts → entries/
```

### Capabilities (stay; lose only domain-specific bits)

```
database/  (rename of db/)  drivers/{d1,libsql}, registry, plugin-helpers, db.ts(connection), index.ts
                            schema.ts → becomes AGGREGATOR of each module's table
                            repositories/ → entries/data/
storage/                    filesystem, prefix, registry, drivers/r2 ; GAINS errors/capability.ts ;
                            entries/ → entries/storage/
email/                      stays whole (components, drivers, overrides, registry, render, index)
cron/                       drivers, registry, runner, index ; jobs/ → entries/jobs/
```

### Layers above (stay)

```
transport/   http/ local/ cli/ stay. GAINS: src/routes/{api,auth-handler,media-handler}.ts
             (Astro route entrypoints / delivery glue) + src/middleware.ts implementation.
             Standard CRUD stays projected here from each module's descriptors.ts.
policies/    with-permissions.ts (composition mechanism) stays;
             permissions.ts DEFINITIONS drained to each module/permissions.ts;
             GAINS utilities/permission-match.ts
kernel/      admin-config, astro, boot, config-resolver, route-registration — stay
codegen/     type-generator, plugin-client-manifest — stay
```

### Consumers & extension

```
client/      stays (index.ts)
admin/       UNTOUCHED — client world. Keeps its own field/entry components.
plugins/     runtime/ (plugin-schema, plugin-fields, plugin-identity, plugin-runtime) is CORE — stays.
             seo/ redirects/ menus/ → packages/ in Stage 4.
```

### Drained grab-bags

```
types/       KEEP public contract: api, config, sdk, plugins, definitions, hooks, index.
             DRAIN: domain.ts → domains; fields.ts → fields/; services.ts → review (contract vs internal).
utilities/   KEEP generic only: bytes, dates, strings, labels, options, locale, with-default-shape.
             DRAIN everything else per the maps above.
```

### Root files

```
src/index.ts        → content becomes exports/index.ts (public).
src/fields.ts       → fields/ module + exports/fields.ts
src/columns.ts      → fields/columns.ts + exports/columns.ts
src/middleware.ts   → transport/ impl + exports/middleware.ts
src/config.d.ts env.d.ts → stay (ambient declarations)
```

## 6. Migration sequence (each stage fully green before the next)

**Stage 1 — `exports/` public layer, over the CURRENT structure.** Curated barrels; repoint
`package.json` exports + tsup at them; relocate public `.astro` files; move `demo`/`scripts`/drizzle
configs off raw `../src`; add the dep-cruiser boundary rule. Public contract frozen here.

**Stage 2 — internal modularization.** Create domain modules + shared core; drain `utilities`/`types`;
redistribute root files, `db/repositories`, `storage/entries`, `cron/jobs`; move permission
definitions into modules. `exports/` barrels re-point inward — public surface never moves. **Rewrite
`.dependency-cruiser.cjs`** to express the new DAG (capabilities = leaf; domains import shared-core +
capabilities only, never peers; transport/policies/kernel above; admin → client only; demo/scripts ↛
src internals). Do this module-by-module (one domain per sub-agent), each green before the next.

**Stage 3 — `db` → `database` rename.** Now trivial: internal-only (public schema name already settled
in `exports/`). Update `@/db/*` imports (~65), the bare `@/db`, tsup source paths, drizzle configs.
Do NOT touch the bare specifier `hono/utils/http-status`.

**Stage 4 — hoist first-party plugins** to top-level `packages/{seo,redirects,menus}/`, each
consuming core via the `astromech` public surface. Set up npm workspaces only if needed to resolve
imports cleanly. Plugin _runtime_ stays in core. Move their `package.json` exports/tsup entries out
of core.

**Deferred (backlog, NOT this effort):** a nicer seeding process.

## 7. Test discipline (non-negotiable — autonomous run)

- **Characterization first.** Before moving a module, ensure tests cover its behaviour; if coverage
  is thin, add tests _before_ the move (use the `tester` agent — Vitest, real fixtures, never mock
  the DB). Capture a green baseline (test count + pass) up front.
- **The dev gate** (run after every stage; all must pass):
  `npm run typecheck` (tsc -p tsconfig.test.json) · `npm run test:run` · `npm run build` ·
  `npm run lint:deps`. **NOT** `npm run lint` (pre-existing eslint/prettier debt).
- **Build OOM:** the DTS worker can OOM — run build with `NODE_OPTIONS=--max-old-space-size=8192`.
- **Admin SPA:** broken side-effect imports pass tsc + build and only surface in the browser. After
  any stage that could touch admin imports/exports, **browser-verify** against the demo on port 4323
  (`admin@astromech.dev` / `password`). The demo loads the library from `dist/` — `npm run build`
    - restart the dev server first. Discard test writes to `demo/database.db`.

## 8. Sub-agent rules (delegation)

- One stage (or one domain within Stage 2) per `coder` sub-agent. Give each a **full plan**: exact
  file moves (use `git mv` for rename detection), exact import rewrites, and explicit **exit
  criteria** (the dev gate green).
- **Commit/stash the main tree before any worktree agent** — worktrees fork from the last commit and
  silently overwrite uncommitted work. Don't trust `isolation: "worktree"`'s base (it has forked from
  an unpredictable base here) — create the worktree from a verified base and run a non-isolated agent
  scoped to that absolute path.
- **Check every sub-agent's commits**: they may `--no-verify` despite instructions. Verify the gate
  actually ran and passed; re-run it yourself if unsure.
- **Stage explicit paths — never `git add -A`.** Untracked `NEXT.md` (gitignored) and
  `.claude/commands/` must not be swept in. `git commit` takes the whole index — reset/re-stage if a
  commit would swallow unrelated staged changes.
- Conventional commits (`refactor:`/`feat:`/`fix:`). Commit messages end:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 9. Close-out (after Stage 4)

- Update `ARCHITECTURE.md` (the layer model + directory map shifted substantially).
- Update `TERMINOLOGY.md` for any renamed/added term.
- Update the relevant `roadmap/` files; add `backlog.md` entry for the seeding process.
- Update project memory `project_services_refactor` (layer model superseded by this) and
  `project_globalthis_singletons` if entry-chunk boundaries changed.
- **Delete this spec** — its feature has shipped.
