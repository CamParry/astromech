---
area: config
---

# Core keeps two export maps

`publishConfig.exports` is the `dist` map npm consumers get. The repo's `exports` points Vite-loaded subpaths (`./middleware`, `./routes/handler.ts`, `./media/Image`) at `src`, and anything the config loads in plain Node stays on `dist` (`packages/astromech/scripts/check-exports-parity.mjs`). Every subpath built into `dist` resolves to source in the site's Vite, since a mix puts two copies of core in the bundle and an error class from one fails the other's `instanceof`.

**Rejected:** Node `#src/*` subpath imports; a global `@/` alias (collides with a site's own); pointing the handler and middleware at `dist` (`./media/Image` imports core's source).
