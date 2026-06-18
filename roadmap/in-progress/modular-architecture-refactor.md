# Modular Architecture Refactor

Reorganises `src/` from the old linear spine (`storage→services→policies→transport→Client`)
into a modular screaming-architecture **DAG** of deep domain modules. Behaviour-preserving;
published package surface frozen via `src/exports/`. Branch: `refactor/modular-architecture`.
In-flight design contract: `specs/modular-architecture.md` (delete once Stage 4 ships).

- [x] Stage 1 — `src/exports/` public layer (sole published surface; tsup builds from it, package.json subpaths frozen)
- [x] Stage 2 — domain modules `entries/ media/ users/ settings/`; `fields/` shared-core; `services/`→`context/` capability; modular dep-cruiser DAG enforced
- [x] Stage 3 — `db/`→`database/` rename (internal-only; public `astromech/db/schema` frozen)
- [x] Drain — entry-specific errors into `entries/`; `leaves-are-pure` rule enforced (`types`/`utilities`/`errors` import only leaves)
- [x] Drain — permission model hoisted to `permissions/` capability; `policies/` keeps only the `withPermissions` enforcer
- [x] Stage 4 — extract `plugins/{seo,redirects,menus}` → separate published `@astromech/*` npm packages (decided: real monorepo, not internal workspace). Done as three vertical slices (menus → redirects → seo), each gate-green + browser-verified:
    - [x] Public plugin-authoring API (`astromech/plugin-kit` subpath) — added incrementally, only what the packages actually reach: `sanitisePackage`, `derivePluginName`, `pluginTablePrefix`, `resolveEntryUrl`, `resolveEntryPath`, `tableStorage`, `t`. (`pluginSchemaModule`/`pluginAssetRoot` not exposed — a graduated package hardcodes `{package}/schema` and `{package}` as its asset root; `labelToSlug`/`TableStorageOptions` weren't reached.)
    - [x] Per package `packages/{seo,redirects,menus}/`: own `package.json` (`@astromech/*`, exports, `astromech` peer dep + `file:../..` dev link), own tsup build (+ `tsc` over seo's `.tsx`), source moved from `src/plugins/*`, `@/…` imports rewritten to `astromech` / `astromech/fields` / `astromech/columns` / `astromech/plugin-kit`. redirects ships a pure `./schema` subpath; seo ships admin `.tsx`/`.css`/locales as SOURCE via `./admin/*` + `./locales/*` exports.
    - [x] Root: `workspaces` += `packages/*`; build orchestrates the packages (`tsup && npm run build -w @astromech/...`); dropped `astromech/plugins/*` exports + tsup entries + the `src/exports/plugins/*` barrels; `src/plugins/` now holds only `runtime/`.
    - [x] Demo consumes `@astromech/{seo,redirects,menus}` (+ `@astromech/redirects/schema` in seed) + workspace deps. Redirects migration kept neutral: root `drizzle.config.ts` points at `packages/redirects/src/schema/redirects.ts` (same table → `db:generate` reports no changes).
    - [x] dep-cruiser scans `packages/`; new `packages-only-public-surface` rule (packages may reach `src/index.ts` + `src/exports/` only); the dead `plugins/(seo|redirects|menus)` alternations removed.
    - Note: `plugins/runtime` (the hook engine) STAYED in core — only the three first-party plugins moved out.
- [ ] Untangle the `plugins/runtime` ↔ `entries` cycle (dependency inversion: entries registers entry-access factories into plugin-runtime at boot), then add the withheld `plugins-runtime-is-a-capability` rule
- [x] Move `client/` → `transport/http/client/` (client half of the http transport; admin/client dep-cruiser rules repointed)
- [x] Close-out (docs) — ARCHITECTURE.md updated (DAG, directory map + `packages/`, public entry points); TERMINOLOGY.md needed no change; `specs/modular-architecture.md` deleted (shipped).
- [ ] Close-out (merge) — merge `refactor/modular-architecture` → `main` (awaiting user confirmation). Once merged, move this file to `roadmap/completed/`.
