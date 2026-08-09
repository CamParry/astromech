# 0041 — the admin package split waits on two prerequisites, and `astromech/ui` does not load under Node

**Date:** 2026-08-09
**Status:** accepted
**Supersedes:** 0007, in one claim only — everything else in that record stands

`roadmap/planned/admin-as-its-own-package.md` was filed as "planned, not
designed" with four open questions. All four are answered. The answer to the
whole is that the move does not proceed as specified: it is blocked on two
prerequisites, and two of its three justifications have been paid down by other
work since it was written.

## The seam is wider than the item recorded, and the widest edge is uncounted

Re-measured, `admin/` reaches 22 modules outside itself in 147 import
statements — 57 value and 90 type-only — against the item's "43 reaches". The
57 are 21 × the fetch client, 17 × `@/utilities/*`, 11 × `@/fields/*` and 8
across five `*.shared.ts` leaves.

That correction matters less than what no count includes.
`virtual:astromech/admin-config` is imported by 25 admin files and
`virtual:astromech/plugins/components` by 5. Neither is a `@/` path, so neither
appears in a dependency-cruiser result or a grep for the seam, and neither
resolves outside a Vite graph that has run the integration's
`astro:config:setup`.

So the admin's dependency on core is not a set of imports that a published
subpath could satisfy. It is a dependency on being compiled by the consumer,
after the integration has registered its virtual modules — and a package
boundary does not address it.

## The admin cannot ship built

`boot/astro.ts` points everything at `pkgSrc`: four `injectRoute` calls, the
`@/` alias, the three `astromech/ui*` aliases, and `TanStackRouterVite`'s
`routesDirectory`. That much could in principle be changed.

What cannot is that **the consumer contributes modules to the admin's graph**.
`apps/demo/astromech.config.ts` declares an admin page as
`component: './src/admin/pages/site-status.tsx'`;
`codegen/plugin-client-manifest.ts` resolves it against the Astro project root
and code-gens a lazy `import()` for it. The graph is not closed until the
consumer builds, so there is no artifact to pre-build.

This is where the Payload comparison stops holding. `packages/ui` ships built
because nothing a Payload consumer authors lands inside it. Ours does.

## `astromech/ui` is the expensive question, and both answers are bad

The subpath is described as a component surface, but its barrel exports
`useAstromechPlugin` (fetch client, auth context), the `CommandPalette` module
(`virtual:astromech/admin-config`), `ApiErrorPanel` and the AI-context hooks
beside the ~45 pure atoms. It is admin code with a public name on it, so if
`admin/` moves, `ui` moves with it. Two ways out, both costed:

**Keep the subpath name.** `astromech` re-exports across the boundary, so
`astromech` depends on `@astromech/admin` which depends on `astromech`. A
package cycle, and one that puts React, TanStack Router, tiptap, base-ui and
dnd-kit back into the server package's dependency closure — which is most of
what the split was for. Rejected.

**Change the plugin contract.** Roughly 25 edit sites: three `exports`
subpaths, each present in both `exports` and `publishConfig.exports`; three tsup
entries; three barrels; five plugin source files and two test mocks; two
`apps/demo` files; three `apps/docs` pages; `ARCHITECTURE.md`; and
`packages/plugins/AGENTS.md`. Mechanically small. Its real cost is that it
rewrites the one-sentence rule [0007](0007-plugin-core-boundary.md) exists to
make memorable — "a plugin package imports `astromech` and `astromech/ui`, and
nothing else from core" — and a rule that has to be relearned is a rule that
gets broken, which is how `@astromech/authoring` walked past the original.

Neither is chosen here. The choice is deferred behind the prerequisite that
makes the second one cheap.

## `astromech/ui` does not load under plain Node

[0007](0007-plugin-core-boundary.md) states, of `astromech` and `astromech/ui`,
"Both load under plain Node (verified above); `astromech/ui` is browser code and
never sees a `virtual:` specifier at all." The second half of that sentence is
false and the first half is false for `astromech/ui`. Verified two ways:

```
$ node --input-type=module -e "await import('astromech/ui')"   # ERR_MODULE_NOT_FOUND
```

and in the build output — the barrel's chunk (`dist/chunk-LFQ43MON.js` at the
time of writing) carries
`import adminConfig from 'virtual:astromech/admin-config';`, by way of
`CommandPalette`.

`packages/astromech/scripts/check-node-imports.mjs` already had this right: its
header calls `astromech/ui` browser-only and deliberately keeps it out of
`SUBPATHS`, so the gate has never asserted the claim the record made.

**The rule still holds, for a different reason than 0007 gave.** A plugin's
Node-loaded entry — the `plugin()` factory and everything hanging off it — never
imports `astromech/ui`. Only the plugin's source-shipped `./admin/*` components
do, and those are compiled by the consumer's Vite, where the virtual module
resolves. `ARCHITECTURE.md` now states it that way. 0007 is not edited; this
record supersedes that one claim and nothing else in it.

`admin/components/dev/` was the fourth open question and is not a factor at all:
two files, one component behind `import.meta.env.DEV` in `app-shell.tsx`, while
`import.meta.env.DEV` appears in three other admin files anyway — including
`admin/support/ui-instance-guard.ts`, which the `astromech/ui` barrel imports on
its first line.

## Two of the three justifications are gone

The item led with the dependency-cruiser rule: "the one rule with a growing
file-level allowlist". `roadmap/completed/module-boundary-enforcement.md` step 2
replaced that allowlist with the `*.shared.ts` marker, leaving
`admin-only-client-and-pure-leaves` at nine lines and one `pathNot`. There is
nothing left to grow. Step 1 generates the layer rules from the `LAYERS` table,
so the "DAG scan covers 479 files" cost is now runtime, not maintenance.

One justification stands: **a broken import in the admin entry passes the whole
gate.** `check:boot` asserts `/admin` returns 200, and `admin/shell.astro`
mounts `<AdminApp client:only="react" />`, so a live shell in front of a dead
client is indistinguishable from a working admin.

## The prerequisites, and what they do to the case

`roadmap/planned/config-free-component-kit.md` splits the `astromech/ui` barrel
into a config-free kit and the config-bound exports — Payload's
`packages/ui` shape. It is landable and verifiable while the admin is still
in-package, it makes `astromech/ui` describable in one sentence, and it turns
the fork above from a design question into a mechanical move.

`roadmap/planned/gate-executes-the-admin.md` asserts, headlessly, that the
mounted admin renders. It closes the one standing justification directly, and
far more cheaply than moving 196 files.

The second prerequisite therefore argues against the thing it unblocks, and that
is recorded deliberately. If it lands, the remaining case for the split is prior
art and a file count, with no uncaught defect class behind it. A reader who
finds this record after the prerequisites have shipped should read the item as
weaker than when it was filed, not stronger.

## What the split would cost that was not counted

`lint:deps` scans `packages/astromech/src` only, and the plugin packages carry
no `lint` or `lint:deps` script. Moving `admin/` out means nothing in the repo
checks the new package's internal shape; the `exports` boundary substitutes only
at publish time, and only for what crosses it. That is a new blindspot traded
for one `roadmap/completed/module-boundary-enforcement.md` already closed.

## Not rejected

The item stays in `roadmap/planned/`. Nothing here says the admin should live in
the server package forever — it says the move is not the cheapest fix for
anything it currently claims to fix, and that two smaller pieces of work should
land before it is reconsidered.
