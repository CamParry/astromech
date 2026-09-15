# packages/admin

The published `@astromech/admin`: the admin SPA, the component kit behind core's `astromech/ui` subpaths, and the Vite helper core's Astro integration merges. Root `AGENTS.md` applies; this adds what is local to the admin. Admin UI work also follows the `ui` skill.

- **Imports inside the admin are relative.** It reaches core through `astromech/shared`, `astromech/fetch` and type-only imports from `astromech`, and nothing else. A lint rule refuses any `@/` import and any other `astromech/*` subpath here (`ARCHITECTURE.md`, "The browser boundary"). The `@/*` entry in `tsconfig.json` points at core's `src` only so the core source those entries reach can be type-checked.
- **Code only the admin uses lives here**, not in core's leaves. A browser-safe value the admin needs from core is added to `packages/astromech/src/exports/shared.ts`.
- **It ships as source.** The site's Vite compiles it after core's integration has registered `virtual:astromech/admin-config` and `virtual:astromech/plugins/components`, which `src/virtual-modules.d.ts` types. tsup builds only what plain Node loads: `src/vite.ts` and the four `astromech/ui` entries in `src/exports/`.
- **`src/vite.ts` is the admin's side of the site's Vite config.** A new browser dependency goes in its `optimizeDeps.include` and in `publicHoistPattern` in `pnpm-workspace.yaml`; `packages/astromech/tests/integrations/astro/vite.test.ts` fails when the two disagree.
- **The route tree, `routeTree.gen.ts`, is generated and gitignored.** `pnpm -F @astromech/admin routes:generate` writes it, and `typecheck` runs that first.
- **The admin's one global is `globalThis.__astromechAdmin`**, declared in `src/components/ui/instance-guard.ts`. Lint refuses a global declared anywhere else.
- **Its tests live in core**, in `packages/astromech/tests/admin/`, and import `@/admin/...`, which core's test config maps to this package's `src`.
