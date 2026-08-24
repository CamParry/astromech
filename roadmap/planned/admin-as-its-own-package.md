# Admin as its own package

`src/admin/` is 257 of the 577 source files in `packages/astromech`. It is the
single largest directory in core by a factor of five over the next one
(`entries/`, at 50), and it is a React SPA living inside the package that ships
the server. No comparable project does this: Payload has `packages/ui` and
`packages/next`, Directus a top-level `app/`, Strapi `packages/core/admin`,
Sanity a separately packaged studio.

The move is now designed, and the design says **not yet**. Two prerequisites
have to land first, and of the three costs the move was going to pay down, two
have already been paid down by other work. This file holds the reasoning, the
measurements and what is left to do.

## The seam, re-measured

The earlier count — 43 reaches, 22 of them one import, 21 across twelve leaf
modules — no longer reproduces, and the direction of the error is the
unwelcome one. `admin/` reaches **22 modules outside itself in 147 import
statements**: 57 value (runtime) imports and 90 type-only.

| Target                          | Value imports |
| ------------------------------- | ------------: |
| `@/transport/http/client/index` |            21 |
| `@/utilities/*`                 |            17 |
| `@/fields/*`                    |            11 |
| five `*.shared.ts` leaves       |             8 |
| **Total**                       |        **57** |

`roadmap/completed/manifest-driven-transports.md` step 3 rewrote the fetch
client's implementation as a proxy over the route table, which is why the old
note said the two should not be in flight together. It did not touch the 21
call sites, so the seam is the same width it was and the conflict is gone.

The 90 type-only edges cost nothing at a package boundary — they erase — but
they are the reason a naive file count overstates the work in both directions.

## The reach nothing counts

`admin/` imports `virtual:astromech/admin-config` in **25 files** and
`virtual:astromech/plugins/components` in **5**. Neither is a `@/` path, so
neither appears in any count of the seam, and neither resolves anywhere except
inside a Vite graph that has already run the integration's `astro:config:setup`.

This is the decisive fact about the whole item. The admin does not depend on
core through imports it could be given a published subpath for; it depends on
being **compiled by the consuming project's Vite, after the integration has
registered its virtual modules**. A package boundary does not address that at
all.

## The four questions, answered

### Does the admin ship built, or as source? — as source, and it cannot ship built

`integrations/astro/index.ts` computes `pkgSrc` from its own module URL, and everything the
integration registers points at package source: the four `injectRoute` calls,
the `@/` alias, the three `astromech/ui*` aliases, and
`TanStackRouterVite({ routesDirectory: pkgSrc + '/admin/pages' })`. The alias
comment states the reason — plugin components must share module identity (React
context, hooks) with the admin, and `admin/support/ui-instance-guard.ts` exists
to detect the failure when they do not.

The decisive case is not core's own code. **Consumer-authored admin components
exist**: `apps/demo/astromech.config.ts` declares
`component: './src/admin/pages/site-status.tsx'`, and
`codegen/plugin-client-manifest.ts` resolves that against the Astro project root
into an absolute path, code-genned as a lazy `import()`. The admin's module
graph is not closed until the consumer builds, so there is no artifact to
pre-build. Payload's split does not face this: its `packages/ui` ships built
because nothing a consumer writes lands inside it.

### Does `astromech/ui` move with it? — it has to, and that is the expensive part

`astromech/ui` is not a component kit. Its barrel exports `useAstromechPlugin`
(which needs the fetch client and the auth context), `CommandPalette` (which
needs `virtual:astromech/admin-config`), `ApiErrorPanel`, `useAIContext` and
`useFieldValue` alongside the ~45 pure atoms. So if `admin/` moves, `ui` moves
with it, and the fork is:

- **Keep the subpath name.** `astromech` then depends on `@astromech/admin`,
  which depends on `astromech` — a package cycle. It also puts React, TanStack
  Router, tiptap, base-ui and dnd-kit back into the server package's dependency
  closure, which is most of what the split was for.
- **Change the plugin contract.** Roughly 25 edit sites: three `exports`
  subpaths, each present twice (`exports` and `publishConfig.exports`); three
  tsup entries; three barrels; five plugin source files plus two test mocks; two
  `apps/demo` files; three `apps/docs` pages; `ARCHITECTURE.md`; and
  `packages/plugins/AGENTS.md`. Mechanically small — and it rewrites the
  one-sentence rule that `ctx` is the only bridge from a plugin to core.

Neither option is unavailable; both are worse than they look from the file
count. `roadmap/completed/config-free-component-kit.md` is the work that makes the
second one cheap, and it is worth doing whether or not the split ever happens.

### What happens to `admin/components/dev/`? — nothing

Two files, one component, rendered behind `import.meta.env.DEV` in
`app-shell.tsx`. `import.meta.env.DEV` appears in three other admin files
anyway — `main.tsx`, `ComponentErrorBoundary.tsx` and
`admin/support/ui-instance-guard.ts`, which the `astromech/ui` barrel itself
imports on its first line. The directory constrains nothing.

### Is the cost worth paying before v1? — not until the prerequisites land

Nothing is deployed, so there is no release to protect, which still argues for
doing structural work early. Against it: the case has got weaker, not stronger,
since the item was written.

## What the case looks like now

Of the three costs the move was going to remove, one survives.

- **Paid down — the dependency-cruiser rule.** The item led with
  `admin-only-client-and-pure-leaves` being "the one rule with a growing
  file-level allowlist". `roadmap/completed/module-boundary-enforcement.md`
  step 2 reduced it to nine lines with a single
  `pathNot` of `\.shared\.(ts|tsx)$|^src/transport/http/client/`. There is no
  allowlist left to grow.
- **Mostly paid down — the DAG scan's scope.** Step 1 of the same item
  generates the layer rules from one `LAYERS` table, so the per-rule maintenance
  that made a 577-file scan expensive is gone. The scan still covers `admin/`;
  that is now a runtime cost, not a maintenance one.
- **Paid down — a broken import in the admin entry passes the whole gate.**
  `check:boot` asserted `/admin` returns 200, but `admin/shell.astro` mounts
  `<AdminApp client:only="react" />`, so a 200 shell in front of a dead client
  passed. `roadmap/completed/gate-executes-the-admin.md` now loads the admin in
  a browser and asserts it painted.

That was the last standing justification, and it was addressed far more cheaply
than by moving 257 files.

Dropping dependency-cruiser changed the balance again: the
browser boundary is no longer checked at lint time — only `check:boot`'s
admin-paint assertion catches a server import in the client bundle, at runtime.
The package boundary this split creates is the durable replacement, which moves
the split up the queue: it is one of the next items to be tackled.

## Prerequisites

1. **`roadmap/completed/config-free-component-kit.md`** — split
   `astromech/ui`'s barrel into a config-free kit and the config-bound exports.
   Independently landable and verifiable while the admin is still in-package,
   and it turns the `astromech/ui` question above from a design fork into a
   mechanical move.
2. **`roadmap/completed/gate-executes-the-admin.md`** — landed. A headless check
   that the mounted admin renders. It closed the one standing justification,
   which makes the case for the split thinner rather than thicker. That is the
   honest reading and it is written down in that file too.

Both are worth doing on their own terms. Neither commits to the split.

## What checks the shape of the new package

Since dependency-cruiser went, nothing in the repo checks any
package's internal shape, core's included. The split therefore creates no new
blindspot relative to the status quo — it moves `admin/` from one unchecked
interior to another. What remains is the `exports` boundary at publish time, and
that is the check this split strengthens: a browser package cannot import server
code it does not declare.

## Notes / caveats

- `roadmap/planned/domain-owned-service-contracts.md` would shrink the seam
  further, but its step 2 stopped on a measurement: the domain service contracts
  stay in the `types/` leaf, because they have cross-layer fan-in. Not a
  prerequisite either way.
- The `pkgSrc` alias survives the split. Even with a config-free kit, the app
  and the kit still share context hooks (`useFieldValue`,
  `useAstromechPlugin`), so one module instance is still required and
  `integrations/astro/vite.ts` still has to alias the admin package's source
  into the consumer's Vite graph.
- A worktree cannot verify this. `.claude/worktrees/*` resolve `node_modules`
  and `dist` to the main checkout, so a new package would not resolve there.
  Verify on `main`.
