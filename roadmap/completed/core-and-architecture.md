# Core & Architecture

- [x] Project restructure — all admin UI under `src/admin/`; SPA replaces the old `.astro` routes; standardised on Base UI (Radix removed)
- [x] Upgraded to React 19, TipTap 3, Astro 6, ESLint 10, Vitest 4; `tsc --noEmit` clean
- [x] `DatabaseDriver` factory pattern with `libsql` and `d1` drivers
- [x] Removed module-level mutable globals (`serverContext`); `globalThis` singleton pattern for cross-chunk registries
- [x] `src/support/` utilities (`strings`, `bytes`, `dates`); `src/types.ts` split into domain/config/api/hooks/plugins/sdk modules
- [x] Framework-agnostic `src/index.ts` (`defineConfig`/`defineEntryType`/`definePlugin` + types); Astro integration at `src/kernel/astro.ts` (`astromech/astro`; thin shell over `kernel/boot` + `kernel/admin-config`)
- [x] Hardening pass: removed `any` types, fixed `useEffect` dependency bugs, populate/`updatePositions` repository bugs, type-generator nested-field bug
