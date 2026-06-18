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
- [ ] Stage 4 — hoist first-party plugins `plugins/{seo,redirects,menus}` → top-level `packages/` (settle packaging approach: separate npm packages vs internal workspace)
- [ ] Untangle the `plugins/runtime` ↔ `entries` cycle (dependency inversion: entries registers entry-access factories into plugin-runtime at boot), then add the withheld `plugins-runtime-is-a-capability` rule
- [x] Move `client/` → `transport/http/client/` (client half of the http transport; admin/client dep-cruiser rules repointed)
- [ ] Close-out — finish ARCHITECTURE.md/TERMINOLOGY.md, delete `specs/modular-architecture.md`, merge to `main`
