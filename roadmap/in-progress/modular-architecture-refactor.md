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
- [ ] Stage 4 — extract `plugins/{seo,redirects,menus}` → separate published `@astromech/*` npm packages (decided: real monorepo, not internal workspace). Concrete plan:
    - [ ] Expose a public plugin-authoring API (new `astromech/plugin-kit` subpath): plugin-identity (`sanitisePackage`, `derivePluginName`, `pluginAssetRoot`, `pluginSchemaModule`, `pluginTablePrefix`), entry-URL (`resolveEntryUrl`/`resolveEntryPath` + `UrlEntry`), labels (`t`/`labelToSlug`), `tableStorage` (+ `TableStorageOptions`). These are the only non-public internals the plugins reach.
    - [ ] Per package `packages/{seo,redirects,menus}/`: own `package.json` (`@astromech/*`, exports, `astromech` peer dep), own tsup build, source moved from `src/plugins/*`, internal `@/…` imports rewritten to public `astromech` / `astromech/fields` / `astromech/columns` / `astromech/plugin-kit` specifiers.
    - [ ] Root: `workspaces` += `packages/*`; multi-package build orchestration; drop `astromech/plugins/*` from package.json exports + tsup entries + `src/exports/plugins/*` barrels; delete `src/plugins/{seo,redirects,menus}/`.
    - [ ] Demo: `astromech/plugins/seo` → `@astromech/seo` etc. (breaking public-path change) + workspace deps; `astromech/plugins/redirects/schema` → `@astromech/redirects/schema`.
    - [ ] dep-cruiser: add `packages/` to the scan; clean the now-dead `plugins/(seo|redirects|menus)` alternations.
    - Note: `plugins/runtime` (the hook engine) STAYS in core — only the three first-party plugins move out.
- [ ] Untangle the `plugins/runtime` ↔ `entries` cycle (dependency inversion: entries registers entry-access factories into plugin-runtime at boot), then add the withheld `plugins-runtime-is-a-capability` rule
- [x] Move `client/` → `transport/http/client/` (client half of the http transport; admin/client dep-cruiser rules repointed)
- [ ] Close-out — finish ARCHITECTURE.md/TERMINOLOGY.md, delete `specs/modular-architecture.md`, merge to `main`
