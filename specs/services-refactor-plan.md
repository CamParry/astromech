# Services Refactor Plan — staged reorganisation of SDK & core into the layer model

**Status:** Planned (2026-06-17); not started. Executes the target shape in [[services-architecture.md]]. Heavy-hitting but staged so each step ships green.
**Supersedes:** the `src/sdk` + `src/core` layout.
**Touches:** effectively all of `src/` (see §3 mapping). ~450 source files, 59 test files.
**Related:** [[services-architecture.md]] (the _why_ + vocabulary), [[ai-integration.md]] (builds on Stage 5; **not** part of this plan).

---

## 1. Scope & non-goals

**In scope:** moving the existing capability into the locked layer model — `storage → services → policies → transport → Client`, assembled at the `kernel` — by **relocating**, **renaming**, and **splitting** files. Behaviour is preserved at every stage; this is a structural refactor, not a feature change.

**Explicitly NOT in this plan** (they consume the result — see [[ai-integration.md]]): the method **manifest**, the **MCP server**, the **confirm gate**, the **authoring agent**, the **UI-slot injection**. The only seam this plan lays for them is `defineServiceMethod` + descriptors (Stage 5).

**Guiding rule (from [[services-architecture.md]] §3):** the **dependency-direction invariant** matters more than folders. `services` depend on nothing above them; `policies` wrap services; `transports` compose services + policies; the `Client` consumes the HTTP API. No upward edges.

---

## 2. Target folder structure

The hybrid: **feature-split inside `services`; layer-split everywhere else.** Infrastructure modules (cron, email, images, auth) keep their homes — the layer model governs the _capability spine_, not every utility.

```
src/
  storage/              # persistence — db schema/drivers/registry, file drivers, entry-storage impl, repositories
  services/             # the capability verbs, feature-split
    entries/  media/  users/  settings/      # each: service.ts (+ schema.ts after Stage 5)
  policies/             # composable wrappers
    permissions/        # match, roles, withPermissions
    visibility/         # shape + audience, settings-visibility
    confirmation/       # (placeholder — confirm gate lands via ai-integration)
  transport/
    local/              # the Local API — assembles services into the Astromech object
    http/               # the HTTP API (Hono) — app + per-feature route files + middleware
    cli/                # the CLI
    mcp/                # (future — ai-integration)
  client/               # the fetch Client (consumer of the HTTP API)
  plugins/
    runtime/            # identity, runtime, resolver, admin, fields, schema  (was core/plugin-*)
    menus/  redirects/  seo/                  # first-party (largely unchanged)
  codegen/              # type-generator (+ future method-manifest)
  kernel/               # boot/compose — config-resolver, route-registration, package index, middleware, astro adapter
  support/              # pure helpers — strings/dates/labels, field flattening, url/slug, rich-text, errors
  types/                # shared TS types (left in place — already clean, referenced everywhere)
  admin/                # the admin SPA (a transport, but its own large self-contained world — left in place)
  cron/  email/  images/  auth/               # infrastructure modules (used by services/kernel)
```

Notes / judgement calls to ratify (§7):

- **`admin/` stays put.** It's a transport but ~90 files and self-contained; folding it under `transport/` is churn for no clarity. It _imports_ the Client; that's the only edge that matters.
- **HTTP routes live under `transport/http/`, not inside `services/{feature}/`.** Keeping them out of the feature folders is what enforces "services don't know their delivery shape." (Alternative — vertical slices owning their own routes — was rejected for exactly this reason.)
- **Registries stay with their modules** (db/storage/cron/email/images each own their globalThis registry); the `kernel` _initialises_ them, it doesn't house them.

---

## 3. Current → target mapping

| Current                                                                                       | → Target                                                        | Kind                             |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| `sdk/local/{entries,media,users}.ts`                                                          | `services/{entries,media,users}/service.ts`                     | move + rename                    |
| `sdk/local/index.ts`                                                                          | `transport/local/index.ts` (Local API assembly)                 | **split** (assembly vs services) |
| `sdk/local/{scoped-entries,with-default-shape,context}.ts`                                    | `services/_shared/*` or `support/*`                             | move                             |
| `sdk/fetch/index.ts`                                                                          | `client/index.ts`                                               | move + rename                    |
| `api/` (routes, middleware, index)                                                            | `transport/http/`                                               | move                             |
| `cli/`                                                                                        | `transport/cli/`                                                | move                             |
| `core/permissions.ts`, `permission-match.ts`                                                  | `policies/permissions/`                                         | move                             |
| `core/visibility.ts`, `settings-visibility.ts`                                                | `policies/visibility/`                                          | move                             |
| `core/plugin-*.ts` (6)                                                                        | `plugins/runtime/`                                              | move                             |
| `core/type-generator.ts`                                                                      | `codegen/`                                                      | move                             |
| `core/config-resolver.ts`, `route-registration.ts`                                            | `kernel/`                                                       | move                             |
| `core/entry-storage/*`                                                                        | `storage/entries/`                                              | move                             |
| `core/{entry-fields,entry-url,entry-types,options,settings-page-values,render-rich-text}.ts`  | `support/`                                                      | move                             |
| `db/*`, `storage/*`                                                                           | `storage/` (merge)                                              | move                             |
| `schemas/{entries,users,media,settings}.ts`                                                   | `services/{feature}/schema.ts`                                  | move (Stage 5)                   |
| `adapters/astro.ts`                                                                           | `kernel/astro.ts` (+ thin astro glue)                           | **split** (Stage 6)              |
| `index.ts`, `middleware.ts`                                                                   | `kernel/`                                                       | move                             |
| `cron/`, `email/`, `images/`, `auth/`, `types/`, `support/`, `builders/`, `utils/`, `errors/` | unchanged (utils consolidate into `support/` opportunistically) | keep                             |

**Rename of terms in code/comments** (threaded through stages): `defineSdkMethod` → `defineServiceMethod`; "local SDK" → "Local API"; "fetch SDK" → "Client"; drop "surface"/"orchestrator" from identifiers and comments.

---

## 4. The conflated files — how each splits (within-file refactoring)

From the map, 16 files mix layers. Most "conflations" are _legitimate orchestration_ (a service calling storage + policies is its job) and need only **relocation + import rewiring**, not surgery. The genuine **splits**:

1. **`sdk/local/index.ts`** — assembly _and_ service composition. → assembly becomes `transport/local/` (the Local API); it imports services from `services/`. (Stage 2)
2. **`api/routes/{entries,users,media,settings,plugins}.ts`** — HTTP routing _and_ permission checks _and_ (entries/settings) visibility. → routing stays in `transport/http/`; `can()` checks lift into the `withPermissions` policy; visibility stays a service/policy concern, not a route concern. Routes thin dramatically. (Stages 3–4)
3. **`db/repositories/populate.ts`** — storage populate _and_ visibility filtering. → visibility filtering moves out to the visibility policy / service composition; populate returns raw related rows. (Stage 6)
4. **`core/entry-storage/built-in.ts`** — storage _and_ capability enforcement _and_ hook dispatch. → capability + hooks belong to the entries **service**; storage just persists. (Stage 6)
5. **`core/plugin-runtime.ts`** — registry _and_ hook execution _and_ SDK-context assembly. → registry/hooks to `plugins/runtime/`; context assembly is `kernel`-adjacent. (Stage 6, low priority)
6. **`adapters/astro.ts`** — boot/compose _and_ Astro-specific glue _and_ virtual modules. → boot/compose to `kernel/`; a thin Astro adapter remains. (Stage 6)
7. **`cron/runner.ts`, `images/handler.ts`, `routes/media-handler.ts`** — orchestration/transport mixed with service/storage calls. → relocate; thin transport shells calling services. (Stage 6)

The **legitimate-orchestration** files (`sdk/local/entries.ts`, `sdk/local/media.ts`) are _not_ split — they **are** the services; they just move to `services/{feature}/service.ts` and rewire imports.

---

## 5. Staged sequence

Each stage is independently shippable: **`npm run build` + full test suite green before merge.** Risky semantic splits come _after_ boring mechanical moves.

**Stage 0 — Guardrail + scaffolding.** Create the target dirs (barrel stubs). Add a dependency-direction lint (dependency-cruiser or eslint-plugin-boundaries) encoding the allowed import graph from §1; wire into lint/CI. _No code moves._ This is what stops later stages silently violating the layering.

**Stage 1 — Dissolve `core` (pure relocations).** Move every **non-conflated** `core/*` file to its home (policies, plugins/runtime, codegen, support, kernel, storage). Rewrite imports. `core/` ceases to exist. Large diff, zero behaviour change. _Sub-step by target dir to keep each PR reviewable._

**Stage 2 — Extract the services layer.** `sdk/local/{entries,media,users}.ts` → `services/{feature}/service.ts`. Split `sdk/local/index.ts`: assembly → `transport/local/` (the Local API), importing from `services/`. Move `sdk/fetch` → `client/`. Retire the `sdk/` dir.

**Stage 3 — Relocate the remaining transports.** `api/` → `transport/http/`; `cli/` → `transport/cli/`. Update `kernel` route-registration imports. (Routes still carry permission checks here.)

**Stage 4 — `withPermissions` policy.** Lift the inline `can(role, perm)` checks out of `transport/http/routes/*` into a composable `withPermissions(principal)` wrapper in `policies/permissions`. Trusted transports compose nothing; HTTP composes it. Behaviour identical; routes thin. (Permission strings may still be passed inline until Stage 5.)

**Stage 5 — `defineServiceMethod` + descriptors.** Introduce the shared `defineServiceMethod`; give each service method a descriptor (`input` Zod from the moved `schemas/`, `permission`, `mutates`, `destructive`/`idempotent`). Rename `defineSdkMethod` → `defineServiceMethod` for plugins. `withPermissions` now reads the declared permission from the descriptor instead of route-inline strings. **This is the seam [[ai-integration.md]] builds on** (manifest, MCP, gate) — but those are out of scope here.

**Stage 6 — Cleanup splits (deferrable).** The remaining genuine splits from §4 (populate visibility, entry-storage capability/hooks, astro boot vs glue, image/media handlers). Lower risk-reward; can land opportunistically after the spine is clean.

**Stage 7 — Tear down the scaffolding (mandatory closer).** Remove **every** temporary re-export barrel / old-path shim introduced in Stages 1–2: migrate all remaining consumers to the new paths, then delete the barrels. The refactor is **not complete** while any re-export pointing at an old (`core/`, `sdk/`) path survives — these are transitional only and otherwise rot into a second `core`-style indirection layer. Acceptance: a repo-wide search finds no barrels re-exporting across layer boundaries, and the Stage 0 dependency lint passes with zero exceptions.

---

## 6. Sequencing rationale & risks

- **Moves before meaning.** Stages 1–3 are import-rewrite churn with no logic change — easy to review, easy to revert. The semantic changes (4–5) land on an already-tidy tree.
- **The lint guardrail (Stage 0) is non-negotiable first** — without it, a 450-file reshuffle will reintroduce upward dependencies invisibly.
- **Biggest blast radius:** Stage 1 (every `core/` import in the codebase changes) and Stage 2 (`sdk/` consumers). Mitigate with codemods for import paths + the test suite (59 files) as the safety net; consider temporary re-export barrels at old paths to stage consumer updates.
- **Plugins are mostly spectators** — first-party `plugins/*` change only where they import moved `core` helpers; their `sdk/*` methods are already services.
- **`admin/` is insulated** — it talks to the `Client`, so it's untouched until the `client/` rename (one import path).

---

## 7. Open calls to ratify before Stage 0

1. **`admin/` left in place** (not folded under `transport/`) — agree?
2. **HTTP routes under `transport/http/`** rather than co-located in `services/{feature}/` — agree (it's what enforces "services don't know delivery")?
3. **Temporary re-export barrels** at old paths during Stages 1–2 to decouple consumer updates — want them, or rip-and-replace in one shot? _(Ratified: yes, with mandatory teardown in Stage 7 — no barrel survives the refactor.)_
4. **Stage 6 deferral** — fine to ship the spine (0–5) and leave the cleanup splits for later?
