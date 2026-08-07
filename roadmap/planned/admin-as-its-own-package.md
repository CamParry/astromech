# Admin as its own package

**Status:** planned, not designed. This needs a conversation before an
implementation — the question is where a boundary belongs, and the move is large
enough that doing it wrong is expensive.

`src/admin/` is 196 of the 479 source files in `packages/astromech`. It is the
single largest directory in core by a factor of four over the next one
(`entries/`, at 50), and it is a React SPA living inside the package that ships
the server.

## Why it is worth moving

No comparable project ships the admin UI inside the server package. Payload has
`packages/ui` and `packages/next`; Directus has a top-level `app/`; Strapi has
`packages/core/admin`; Sanity packages its studio separately. The convergence is
not stylistic — it follows from the two halves having different runtimes,
different dependency sets, and different consumers.

Three concrete costs today:

- **The largest dependency-cruiser rule exists only to police this seam.**
  `admin-only-client-and-pure-leaves` is the one rule with a growing file-level
  allowlist. Every project in the comparison enforces this same boundary with a
  package `exports` map instead.
- **A broken import in the admin entry passes the whole gate.** Recorded as the
  admin side-effect import blindspot: `tsc` and the library build both accept it,
  and only a browser check catches it. In a separate package with its own build,
  it fails at build time.
- **The DAG scan covers 479 files to enforce rules that mostly concern the
  other 283.** Removing `admin/` from scope makes every remaining rule easier to
  reason about.

## Sketch, not a plan

- `packages/admin` (or `packages/astromech-admin`) holds the SPA, its routes, its
  styles and its own build.
- It depends on `astromech` for the fetch Client and on nothing else from core.
- The browser-safe domain leaves it currently deep-imports move to a published
  subpath, which is the natural landing place for the `*.shared.ts` convention in
  `roadmap/planned/module-boundary-enforcement.md`.
- `boot/astro.ts` injects the built admin assets rather than pointing at
  package source.

## Open questions

- **Does the admin ship built, or as source compiled by the consuming Vite?**
  Core currently injects routes pointing at package source so Vite compiles them.
  A separate admin package could keep that, but it means every consumer builds
  the SPA. Payload splits the difference: `packages/ui` ships built, `packages/next`
  ships thin.
- **Does `astromech/ui` (the plugin-facing component surface) move with it?**
  Plugins import `astromech/ui` today, and it loads under plain Node. If the
  components move to a new package, that subpath either re-exports across a
  package boundary or the plugin contract changes.
- **What happens to `admin/components/dev/`,** which is `import.meta.env.DEV`-gated
  and therefore already assumes a Vite graph.
- **Is the cost worth paying before v1?** Nothing is deployed, so there is no
  release to protect, which argues for doing it early. Against: it touches 196
  files and would conflict with anything else in flight.

## Notes / caveats

- Do `roadmap/planned/module-boundary-enforcement.md` step 2 first. Identifying
  the shared leaves is required either way, and doing it while the admin is still
  in-package keeps that change small and independently verifiable.
- `roadmap/planned/domain-owned-service-contracts.md` shrinks the seam further:
  a domain that owns its own contract is one the admin can depend on by type
  across a package boundary instead of by deep import. Not a prerequisite.
- The seam is narrower than the file count suggests. `admin/` reaches outside
  itself in 43 places, and 22 of them are the same import
  (`@/transport/http/client/index.js`); the other 21 are twelve pure leaf
  modules. `roadmap/planned/manifest-driven-transports.md` step 3 rewrites that
  one import's implementation, so the two should not be in flight together.
- A worktree cannot verify this. `.claude/worktrees/*` resolve `node_modules` and
  `dist` to the main checkout, so a new package would not resolve correctly there.
  Expect to verify on `main`.
