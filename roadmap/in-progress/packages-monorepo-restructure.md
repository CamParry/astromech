# `packages/` + `apps/` Monorepo Restructure

Completes the monorepo by relocating the **core** (the repo-root `astromech` package)
into `packages/astromech/` and introducing an **`apps/`** tier for deployable-but-never-published
workspaces (`demo`, future `docs` site). The root becomes a **private workspace root**.
Behaviour-preserving (`/refactor`). Follows the proven plugin-extraction template
(`c100163` = the `git mv` + repoint-every-path analogue).

**Target tree:**

```
packages/astromech/     ← published: astromech (core; owns its build/test/lint config)
packages/plugins/*      ← published: @astromech/{menus,redirects,seo}
apps/demo               ← deployed/run, never published (was demo/)
apps/docs               ← markdown now → Astro site later, never published
root                    ← private workspace root: workspaces + dev-gate scripts + repo-wide config
ARCHITECTURE.md, TERMINOLOGY.md, README.md  ← stay at root (repo-level narrative)
```

**Convention (researched, decisive):** `packages/*` = published to npm; `apps/*` = deployed/run.
Turborepo/pnpm/Nx default; npm handles `["packages/*","apps/*"]` with no glob/cross-link issues.

**Locked decisions:** root → private monorepo root · everything from `src` + `tests`/`scripts`/`drizzle`

- build/test config travels into `packages/astromech/` · `apps/` introduced, `demo`→`apps/demo`,
  `apps/docs` created now holding the markdown · core dir matches npm name (`packages/astromech`) ·
  `.dependency-cruiser.cjs` **lives in `packages/astromech/` and scopes to core's own internal DAG
  only** — cross-package isolation is the job of the package boundaries (each plugin's `exports` map +
  `astromech` peer dep), so the repo-wide cross-package rules retire (see Phase 2) · narrative docs stay
  at root.

**Key de-risking insight (verified in code, not assumed):** `src/`, `dist/`, `drizzle/`, and
`tsr.config.json` all move **together as one unit**, so every _package-internal relative path is
preserved_ — `kernel/astro.ts` (`pkgSrc = new URL('../../src', import.meta.url)`) and `kernel/boot.ts`
(`migrationsFolder = new URL('../../drizzle', …)`) need **no edit**. The real breakage surface is purely
_cross-boundary_: the root package split, the `node_modules/astromech` self-link, root-anchored config,
and the demo/plugin `file:` links.

**Sequence rationale:** docs first (trivial, isolated, establishes `apps/`); then the atomic core move
**while `demo/` stays at root as the stable verification harness** (only one variable: core's new
location); then relocate `demo/` last as a mechanical known-pattern move. Each phase gated green +
browser-verified.

**Gate (the dev gate — NOT `npm run lint`):**

```
npm run typecheck && npm run test:run \
  && NODE_OPTIONS=--max-old-space-size=8192 npm run build \
  && npm run lint:deps && npm run db:generate
```

Baseline: typecheck 0 · 721 tests · build ok · lint:deps "no dependency violations" · db:generate
"No schema changes". Browser-verify on port 4323 (`admin@astromech.dev`/`password`): config loads,
an admin page + the seo overview React page (`/admin/plugin/seo/overview`) render, redirects/menus work.

---

## Phase 0 — Prep

- [ ] Branch off clean `main` (e.g. `refactor/packages-monorepo`); confirm baseline gate green.

## Phase 1 — `docs/` → `apps/docs` (trivial, isolated; establishes `apps/`)

- [ ] `git mv docs apps/docs` (carries `README.md` + `plugins/authoring.md`).
- [ ] Add `apps/docs/package.json` — minimal `private: true` workspace placeholder
      (e.g. `@astromech/docs` or `astromech-docs`, `private: true`), so the `apps/*` glob picks it up.
- [ ] Root `workspaces`: add `apps/*`.
- [ ] Repoint any references to `docs/` (grep repo; the handoff notes no build config references it).
- [ ] `npm install` (wires the new workspace); gate green.

## Phase 2 — Core: `astromech` (repo root) → `packages/astromech/` (ATOMIC, high-risk)

Strongly consider a **git worktree from a verified base** (per `feedback_agent_worktree_wrong_base`:
create it manually, run a non-isolated agent scoped to it; commit/stash main tree first). Optionally
split the commit: (2a) `git mv` files, (2b) repoint config, (2c) rewire self-link — but gate as a unit.

- [ ] **Move the tree:** `git mv src tests scripts drizzle packages/astromech/`; move build/test/lint
      config into `packages/astromech/`: `tsup.config.ts`, `vitest.config.ts`, `drizzle.config.ts`,
      `tsr.config.json`, `tsconfig.json`, `tsconfig.test.json`, `.dependency-cruiser.cjs`.
- [ ] **Split `package.json`:**
    - `packages/astromech/package.json` = the **published** package: `name: "astromech"`, the ~15
      `exports` subpaths (unchanged — relative to the package), `bin`, `main`/`types`, `files: [dist, src]`,
      all runtime `dependencies` + `peerDependencies` (astro), and core-owned `devDependencies`
      (tsup, vitest, drizzle-kit, dependency-cruiser, happy-dom, tsx, the `@types/*`, eslint/typescript
      toolchain as needed). Scripts: `dev`, `build` (the `tsup && npm run build -w @astromech/*` line —
      keep or hoist; see root scripts), `typecheck`, `test`/`test:run`, `db:*`, `lint`, `format`, `lint:css`.
    - **Root `package.json`** = private workspace root: `private: true`, drop `exports`/`bin`/`main`/`types`/
      `files`/`keywords`/runtime deps; keep `workspaces: ["packages/astromech","packages/plugins/*","apps/*"]`,
      repo-wide `devDependencies` (husky, lint-staged, prettier + prettier-plugin-astro, stylelint + configs,
      eslint baseline, changesets), `lint-staged` block, `prepare: husky`, and **delegating dev-gate scripts**
      so the one gate command in every memory/skill still works:
      `typecheck`/`test:run`/`build`/`db:generate` → `npm run <x> -w astromech`; `lint:deps` → see below.
- [ ] **Self-link rewire (THE central change):**
    - Root `workspaces` gains `packages/astromech` → `node_modules/astromech` now symlinks there.
    - Each plugin devDep `astromech: file:../../..` → `file:../../astromech` (from `packages/plugins/<p>`),
      or simpler `astromech: "*"` now that core is a real workspace. (peerDep `astromech: "*"` unchanged.)
    - `npm install` to rewrite the symlink; confirm `node_modules/astromech` → `packages/astromech`.
- [ ] **`.dependency-cruiser.cjs` (core-scoped):** re-anchor the ~31 `^src/...` rule paths →
      `^packages/astromech/src/...`. **Retire** the cross-package rules `packages-only-public-surface` and
      `demo-scripts-no-src-internals` — plugin/app isolation is enforced by package boundaries (`exports` +
      peer dep) at publish time, not by a repo-wide scan. Config lives in `packages/astromech/` and scans
      **core only**: root `lint:deps` delegates → `npm run lint:deps -w astromech`
      (`depcruise src --config .dependency-cruiser.cjs` from inside core). Verify the bare `astromech`
      self-import still resolves to `packages/astromech/src/index.ts` via the moved tsconfig `paths`
      (per `dep-cruiser-self-import-resolves-to-src`).
    - Trade-off accepted: with workspace symlinks + tsconfig `paths` a plugin _could_ deep-import core
      internals in dev; without the retired rule that's caught by `exports` + the build at publish, not depcruise.
- [ ] **`tsconfig` / `tsconfig.test.json`:** fix `paths` (`@/*`, `astromech`, `astromech/fields|columns|plugin-kit`,
      `@astromech/menus|redirects[/schema]|seo`) and `include`/`rootDir` for the new location. The `@astromech/*`
      → plugin-source paths now resolve `packages/astromech` → `../plugins/*/src`. Decide thin root tsconfig vs none.
- [ ] **`tsup.config.ts`:** entry map from `src/exports/*` + CLI — relative anchors unchanged (config sits
      beside `src/`); verify glob roots resolve from `packages/astromech/`.
- [ ] **`vitest.config.ts`:** `virtual:*` shim aliases, `@`/`@tests`, and the `astromech*`/`@astromech/*`
      source aliases used by plugin tests — repoint the cross-package `@astromech/*` → `../plugins/*/src`
      from core's new location.
- [ ] **`drizzle.config.ts`:** schema paths incl. the redirects table
      `packages/plugins/redirects/src/schema/redirects.ts` (recompute relative to core's config, which is now
      in `packages/astromech/`). `drizzle/` migrations moved with core. `db:generate` must still report
      "No schema changes" (per `drizzle-migration-ordering` — verify with `db:migrate`).
- [ ] **NO EDIT needed (verify, don't touch):** `kernel/astro.ts` `pkgSrc` and `kernel/boot.ts`
      `migrationsFolder` — package-internal relative paths preserved by the unit move.
- [ ] **Demo link (still at root this phase):** `astromech: file:..` → `file:packages/astromech`
      (or `"*"`). (Demo relocates in Phase 3.)
- [ ] **Repo-wide config at root:** confirm `.husky/`, lint-staged, `.prettierrc`, eslint base, stylelint
      configs operate repo-wide; husky hooks run `eslint --fix`/`prettier` on staged files across workspaces.
- [ ] `npm install`; **full gate green**; clear `demo/node_modules/.vite` + `demo/.astro`, restart dev
      server, **browser-verify on a warm server** (config-load, admin page, seo overview React page,
      redirects/menus). Watch the admin side-effect-import blindspot + the `sideEffects:false`/boot-wiring
      gotcha (only browser-verify catches these).

## Phase 3 — `demo/` → `apps/demo` (mechanical relocation)

- [ ] `git mv demo apps/demo`.
- [ ] `apps/demo/package.json`: `astromech: file:packages/astromech` → `file:../../packages/astromech`
      (or `"*"`); `@astromech/*: "*"` unchanged.
- [ ] Repoint demo-specific config/scripts that reference `demo/` from root (`db:seed:demo`,
      `demo/drizzle.config.ts` schema paths, any `lint:deps`/dep-cruiser path that named `demo/seed.ts` →
      `apps/demo/seed.ts`, browser-verify/dev-server paths in skills/memories — note for later doc update).
- [ ] `npm install`; gate green; clear `.vite`/`.astro`, restart, browser-verify on warm server.

## Phase 4 — Close-out

- [ ] Update `ARCHITECTURE.md` (directory map: `packages/astromech`, `packages/plugins/*`, `apps/*`;
      private-root note) and the `project-modular-architecture` memory (new layout, self-link target,
      dep-cruiser location, apps/ tier, demo/docs paths, browser-verify path change to `apps/demo`).
- [ ] Update affected memories/skills that hardcode `demo/` paths → `apps/demo/`.
- [ ] Move this file to `roadmap/completed/`.
- [ ] **Confirm with user** before merging to `main` + pushing. No `--no-verify`; explicit staged paths,
      never `git add -A`; commit trailer `Co-Authored-By:`.

---

## Gotchas to carry (all proven)

- `sideEffects: false` tree-shakes bare side-effect imports — boot wiring must be exported function
  calls, not `import './x.js'`. Re-check if the core move touches boot wiring.
- Astro integration loads in plain Node at config time — must not statically import
  `virtual:astromech/config`; only a demo config-load (browser-verify) catches violations.
- Demo loads the library from `dist/` — rebuild + fully restart dev server before browser-verifying.
- `504 Outdated Optimize Dep` storms after lockfile changes — `rm -rf demo/node_modules/.vite demo/.astro`
  (later `apps/demo/...`), restart, re-verify on a **warm** server.
- DTS build can OOM → `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.

## Delegation

Reserve the main thread for wiring decisions; delegate mechanical execution to `coder` sub-agents with
full, self-contained plans (exact file paths, exact edits, exit = gate green) per
`feedback_subagents_keep_context_tight`. Commit/stash the main tree before any worktree agent.
