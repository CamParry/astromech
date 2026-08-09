# Multi-Runtime & Framework Adapters

- [ ] Document the adapter contract (`RuntimeAdapter`, `FrameworkAdapter` types) in `src/types/`
- [ ] Runtime auto-detection utility (`src/support/runtime.ts`) — Cloudflare Workers, Node, Bun, Deno
- [ ] `astromech/node` — standalone Node/Bun HTTP adapter
- [ ] `astromech/sveltekit` — SvelteKit framework adapter
- [ ] `astromech/nextjs` — Next.js framework adapter

Every adapter here needs an answer to "how does this host boot the runtime and
reach the author's config", and the hosts do not agree.
`roadmap/completed/runtime-boot-and-live-config.md` settles it for Astro and should
set the contract the others implement. What the research turned up, so the wheel
is not reinvented per adapter: SvelteKit has a real once-per-server hook (`init`
in `hooks.server.js`), Next uses `instrumentation.ts` and a path alias to the
config (which is how Payload does it), and Nuxt runs Nitro plugins at server
start while forbidding anything non-serialisable in `runtimeConfig`. All three
are conventions in the **user's** app rather than something a library can inject,
so each adapter likely ships a file the site author is told to add.
