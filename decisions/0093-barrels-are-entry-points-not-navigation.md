# 0093 — barrels are entry points, not navigation

**Date:** 2026-08-24
**Status:** accepted

A re-export barrel exists to give an outside caller one name for a package. It
is not a way for a package to talk to itself. So core keeps barrels exactly
where something outside reads them — `src/exports/`, one file per published
subpath, plus the two under `src/admin/components/` that the Astro integration
aliases for `astromech/ui` and `astromech/ui/fields` — and nowhere else. Every
other import names the file that declares the symbol. `src/types/index.ts` is
the one exception, kept for the reason given below.

Seventeen `index.ts` files went. An `index.ts` holding real code is not a
barrel and stays: `env/`, `ai/`, `fields/rich-text/`, the transports, the
integrations. `entries/jobs/index.ts`, `entries/index.ts` and
`permissions/index.ts` were both at once — their declarations moved to
`entries/jobs/entry-jobs.ts`, `entries/typed-entries-service.ts`,
`permissions/core-permissions.ts` and `permissions/roles.ts`.

## Why now

The barrels had already lost the argument in the code:

- **They were bypassed.** Of 2,798 imports naming a local module across
  `packages/astromech/src` and `tests`, 198 (7%) went through a barrel. The
  other 93% already named the defining file — including, in
  `admin/hooks/use-entry-form.ts`, a deep import carrying a comment explaining
  that the barrel would drag a domain service into the browser bundle.
- **Three had no importers at all.** `database/index.ts`, `cron/index.ts` and
  `config/index.ts` re-exported their modules to nobody.
- **One made a cycle.** `admin/hooks/use-entry-form.ts` imported `useHotkeys`
  from `./index`, which re-exports `use-entry-form`.
- **`sideEffects: false` was untrue because of one.** Both `astromech/ui`
  barrels call `assertSingleUiInstance()` at module scope, so the package told
  every bundler it could delete a call it could not.
- **Nothing made them a boundary.** No rule said "enter a module through its
  barrel", no check enforced it, and the split above shows nobody believed it.

The import cost is the usual argument and the weakest one here. Vitest spends
roughly 300–360s of aggregate module-import time on this suite, and it stayed
inside that range across runs on both sides of the change: the win, if any, is
smaller than the run-to-run variance on one machine. The reasons above stand on
their own.

## What the ecosystem does

Barrels at a package boundary are standard; barrels inside a package are what
the tooling argues against. Payload confines its re-exports to `src/exports/`,
which is where the shape core already had came from. Astro's own source imports
files directly rather than through module indexes. Vite's performance guide
tells authors to avoid barrel files, and the case against them is well covered:
TkDodo's "Please Stop Using Barrel Files", Marvin Hagemeister's module-graph
benchmarks in "The barrel file debacle", and Atlassian's published build-time
data. None of that says a package should have no entry point; all of it says
the entry point should not also be how the package's own files find each other.

## Rejected alternatives

- **Keep module barrels as intra-package boundaries.** The honest version of
  this argument is that a module's barrel declares its public surface to its
  siblings. It loses on the facts: 93% of imports already went around it,
  nothing enforced barrel-only entry, and the browser boundary needed the
  opposite (deep imports of pure leaves), so the barrel was a rule the code
  broke wherever it mattered.
- **Remove `src/types/index.ts` too.** It is 359 of the 624 index imports, and
  it is type-only — every one erases at compile time, so there is no runtime
  graph to shrink and no side effect to preserve. Rewriting them would be the
  largest diff in the change for no effect a bundler or a test run could see.
- **Rename the `index.ts` files that hold real code.** `env/index.ts`,
  `ai/index.ts`, `transport/http/client/index.ts` and the rest are modules that
  happen to be named `index`, which is what a directory's main module is called
  everywhere in Node. Renaming them would churn every importer to make a lint
  rule simpler to write. The rule carries the list instead.

## Scoping `sideEffects`

`sideEffects: false` becomes an array, because four kinds of module in this
package do have side effects: the two `astromech/ui` barrels' instance guard,
the admin entry's field and cell registrations, every admin component's own
stylesheet, and the entry itself. The array names both trees — the Astro
integration aliases `astromech/ui*` to `src/` in dev and in build, while a
published install resolves the same subpaths to `dist/`, and tsup hoists the
guard into a shared chunk, so `./dist/chunk-*.js` is listed with them.

The admin SPA no longer loads a UI barrel, so `admin/main.tsx` calls
`assertSingleUiInstance()` itself. Without that, only a plugin's copy would
register and the stale-`dist` mismatch the guard exists to report would go
unreported.

## Enforcement

An eslint `no-restricted-syntax` selector over core's `src` and `tests` rejects
an import or re-export whose last path segment is `index`, excepting the
modules that hold real code, the two alias targets and the router's route pages
(where `index` is a URL segment). `src/exports/` is exempt: it is the published
surface, and re-exporting is its job.
