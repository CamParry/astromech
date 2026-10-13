---
area: structure
---

# `astromech()` comes before `react()`

The admin splits its bundle by route with TanStack Router's `autoCodeSplitting` (`packages/admin/src/vite.ts`), which must run before `@vitejs/plugin-react`. Astro orders Vite plugins by integration, so a site lists `astromech()` before `react()`.

**Rejected:** reordering Vite's plugin list (unsupported); hand-split `.lazy.tsx` routes; raising `chunkSizeWarningLimit`.
