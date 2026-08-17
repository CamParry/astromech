# 0060 — An `exports` entry's `types` and `default` resolve into the same tree

**Date:** 2026-08-17
**Status:** accepted

Six subpaths in `packages/astromech/package.json`'s repo `exports` map resolved
`types` from `dist` and `default` from `src`: `./ui`, `./ui/fields`,
`./ui/layout`, `./ui/app`, `./middleware` and `./local`. A consumer of any of
them ran edited source against the type surface of the last build. The two
disagree silently — nothing in the gate reads both conditions of one entry, and
`check:exports` compared key sets only, so it could not see the mismatch.

Conditions within one entry must now agree: both targets under `dist/`, or both
under `src/`. `packages/astromech/scripts/check-exports-parity.mjs` enforces it
over both maps, alongside the key-set check it already ran.

The invariant is _within_ an entry, never across the maps. The repo map
resolving `src` where `publishConfig.exports` resolves `dist` is the whole point
of the two-map design ([0033](0033-the-repo-resolves-src-and-npm-gets-dist.md)),
and a check comparing the maps' targets would forbid it.

## What each of the six became

The four `astromech/ui*` entries point both conditions at `dist`, which makes
them identical to their `publishConfig` counterparts.
`packages/astromech/src/integrations/astro/vite.ts` aliases all four to package
source unconditionally, so no host's Vite graph ever consults the map for them;
the `default: src` condition had no consumer and existed only to create the
mismatch. 0033 reached the same conclusion about what a resolver outside the
alias should see, and then wrote the opposite entry.

`./middleware` becomes the bare string `"./src/exports/middleware.ts"`. Nothing
imports it as a module — `src/integrations/astro/index.ts` hands the specifier
to `injectRoute` — so its `types` condition had no consumer either, and a bare
string states plainly that there is no separate type surface. It stays on `src`,
which is what keeps the Astro middleware in the same module graph as the
injected `astromech/routes/handler.ts`.

`./local` keeps the mismatch, under a named exemption in the check. It is the
one subpath where the trap has actually bitten, and stage 12 of
`roadmap/in-progress/application-instance-and-integrations.md` deletes the
subpath; the exemption goes with it.

## What was rejected

`roadmap/in-progress/application-instance-and-integrations.md` proposed the
opposite direction — move `types` to `src` and make the `src/exports/*` shims
resolvable — because the blocker is that the shims import through `@/`, and a
plugin's tsconfig clears `paths`. All three ways to get there were measured and
all three cost more than the mismatch did.

- **Relative specifiers in the shims.** Does not remove the failures, it moves
  them one hop deeper. `src/admin/components/**` imports through `@/` too, and
  those specifiers escape `admin/` immediately (`@/fields/rich-text/extensions`,
  `@/types/fields`), so the consumer's resolver fails one file further along.
- **De-aliasing the graph these subpaths reach.** 825 `@/` specifiers across
  257 files, for four entries that no Vite graph resolves through the map.
- **Node subpath imports** (`"#src/*": "./src/*"`). The only mechanism that does
  resolve for a consumer whose tsconfig clears `paths`, and it works across tsc,
  Vite and esbuild — but only with `.js`-suffixed specifiers, so adopting it
  means rewriting all 1298 `@/` specifiers in the package. Worth filing if `@/`
  becomes a problem somewhere it is not today; not worth it for this.

## A correction to 0033

0033 says `astromech/local` and `astromech/middleware` "import
`virtual:astromech/config` … so neither was ever loadable under Node". That is
no longer true of `astromech/local`. Stage 3 of the application-instance work
removed the module-scope `virtual:` import, and `await import('astromech/local')`
against `dist` now succeeds under plain `node`, exporting `Astromech`, `default`
and `runWithContext`. The premise for keeping `./local` on `src` is therefore
weaker than 0033 recorded — which is one reason stage 12 removes the subpath
rather than repairing it. 0033 is not edited; `decisions/` is append-only.
