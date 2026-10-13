---
area: toolchain
---

# The Cloudflare demo's build copies its whole `.env`

Every build of `apps/demo-cloudflare` copies its `.env` into `dist/server/.dev.vars`, `ANTHROPIC_API_KEY` included. The Cloudflare Vite plugin makes that copy for `wrangler dev` over the build, which is how `pnpm run preview` gets its variables.

**Why:** `wrangler deploy` does not upload the file ([Cloudflare's docs](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)), and `dist/` is gitignored.

**Rejected:** `secrets.required` in `wrangler.jsonc`, which narrows the copy but makes `wrangler deploy` require each listed secret and must be repeated in the `testing` environment. `apps/docs/deployment/cloudflare.md` ("Running it locally") gives both settings that narrow it.
