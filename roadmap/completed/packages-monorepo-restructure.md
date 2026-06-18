# `packages/` + `apps/` Monorepo Restructure

Relocated the **core** (`astromech`) out of the repo root into `packages/astromech/`, made the
root a **private workspace root** (`astromech-monorepo`), and introduced an **`apps/`** tier for
deployable-but-never-published workspaces. Behaviour-preserving. Shipped on branch
`refactor/packages-monorepo`.

**STATUS: COMPLETE** — phases 1–3 done, each gate-green (typecheck 0 · 721 tests · build · lint:deps
clean · db:generate neutral) and demo browser-verified; docs + memory updated. The only remaining
action is the **merge to `main` (awaiting user confirmation)**.

**Final tree:**

```
packages/astromech/     published: astromech (core; owns src/tests/scripts/drizzle + build/test config)
packages/plugins/*      published: @astromech/{menus,redirects,seo}
apps/demo               deployed/run, never published (was demo/)
apps/docs               @astromech/docs placeholder, markdown now → Astro site later (was docs/)
root                    private workspace root: workspaces + delegating dev-gate scripts + repo-wide tooling
ARCHITECTURE.md, TERMINOLOGY.md  stay at root (no root README.md exists on this branch)
```

**Convention:** `packages/*` = published to npm; `apps/*` = deployed/run (Turborepo/pnpm/Nx default;
researched). `node_modules/astromech` symlinks to `packages/astromech`; cross-package `astromech` deps
use the `"*"` workspace specifier.

## What shipped (commits on `refactor/packages-monorepo`)

- [x] **Phase 1 — `docs/` → `apps/docs`** (`1751c0b`): `git mv`, `@astromech/docs` private placeholder,
      added the `apps/*` workspace glob, repointed `docs/` refs (ARCHITECTURE.md, demo rating example).
- [x] **Phase 2 — core → `packages/astromech/`** (`780fe91`, atomic): moved `src/tests/scripts/drizzle`
    - all build/test config; split package.json (root = private `astromech-monorepo` with delegating
      gate scripts; core = published `astromech`); rewired the self-link via `"*"`; tsconfig/vitest/drizzle
      plugin-source + schema paths re-anchored; plugin tsconfigs extend `../../astromech/tsconfig.json`;
      `tsconfig.test` `rootDir` widened to `../..` so plugin sources sit under rootDir.
- [x] **dep-cruiser → core-scoped**: config lives in `packages/astromech/`, scans `src` only; root
      `lint:deps` delegates `-w astromech`. Retired `packages-only-public-surface` +
      `demo-scripts-no-src-internals` (isolation now via package `exports` boundaries). Modules 464→427.
- [x] **Phase 3 — `demo/` → `apps/demo`** (`ae337e9`): dropped the stale `demo` workspaces entry;
      repointed `db:seed:demo`, `.gitignore` db patterns, core's demo-db fallback URLs; fixed
      `apps/demo/drizzle.config.ts` schema → `../../packages/astromech/src/exports/schema.ts`.
- [x] **Close-out**: ARCHITECTURE.md + memories updated (`packages-monorepo-layout`,
      `ambient-dts-virtual-modules`, `verify-subagent-gate-claims`; demo/browser/modular memories
      repointed); this file moved to `completed/`.
- [ ] **Merge to `main` + push** — awaiting user confirmation.

## As-built notes / deviations from the plan

- **`kernel/astro.ts` `pkgSrc` and `kernel/boot.ts` `migrationsFolder` needed NO edit** (predicted):
  package-internal relative paths preserved because src+dist+drizzle moved as one unit.
- **Execution**: no git worktree used — phases are strictly sequential, so they ran on one branch in
  the main tree, mechanical work delegated to `coder` sub-agents, browser-verify + commits on the
  main thread. Each phase checkpoint-committed.
- **The one real scare — `config.d.ts` ambient gotcha** ([[ambient-dts-virtual-modules]]): a sub-agent's
  eslint "fix" converted the `virtual:astromech/config` block's inline `import('./types')` to an
  `import type` statement, which broke the ambient module declaration → `adminConfig` became `any` →
  22 cascade TS7006/TS18046 errors. Reverted to the inline `import()` form + a scoped
  `consistent-type-imports` disable. (eslint isn't in the dev gate, so it only surfaced at husky.)
- **Sub-agents mis-reported typecheck** twice — independent re-verification on the main thread caught
  it ([[verify-subagent-gate-claims]]).
- **Latent eslint debt** surfaced by re-linting the moved files was cleared behaviour-preservingly
  (a `*.test` no-non-null-assertion override + `import type` conversions + scoped inline disables).

## Gotchas proven this effort (carry forward)

- `sideEffects:false` tree-shakes bare side-effect imports — boot wiring must be exported function calls.
- The Astro integration loads in plain Node at config time — only a demo config-load/browser-verify
  catches a stray `virtual:` static import.
- Demo loads the library from `dist/` — rebuild + fully restart the dev server before browser-verifying.
- Stale dev server on 4323 → the new one silently lands on 4324 and login 403s (origin check); kill + restart.
- DTS build can OOM → `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.
