# 0054 — The component kit keeps the `astromech/ui` name, and the app surface becomes `astromech/ui/app`

**Date:** 2026-08-16
**Status:** accepted

`roadmap/planned/config-free-component-kit.md` splits the `astromech/ui` barrel
into the components whose only inputs are their props and the five exports that
need the running admin. It left one judgement call open: which half keeps the
name. Two things were decided.

## The kit keeps `astromech/ui`

The roadmap says to decide against what a plugin author imports most, so the
repo's own import sites were counted. Every site that reaches the barrel reaches
a component — `Button`, `Badge`, `Table`, `Spinner`, `EmptyState`, `PageLoading`,
`ConfirmModal`, `useToast`, `useFieldValue` — and three of them additionally
reach `useAstromechPlugin`. `@astromech/backups` is the shape of it: eight
component imports to one hook. Naming the smaller half `astromech/ui` would have
made the common import the qualified one and rewritten every existing line for
nothing.

It also keeps the sentence in `ARCHITECTURE.md` true in the direction people
read it: `astromech/ui` is the component library, and it now loads under plain
Node like the rest of the plugin surface.

## The app surface becomes `astromech/ui/app`

`useAstromechPlugin`, the `CommandPalette` module, the AI-context hooks and
`ApiErrorPanel` move to a new subpath in both `exports` maps, following
`./ui/fields` and `./ui/layout`. Rejected:

- **A top-level `astromech/admin`.** The prefix is taken —
  `./admin/shell.astro` is a published subpath — and
  `roadmap/planned/admin-as-its-own-package.md` owns where the admin lives. A
  name that pre-empts that item's answer is a name that has to be changed twice.
- **Leaving the five on `astromech/ui`.** The status quo the roadmap exists to
  end: it is what makes the barrel undescribable in one sentence and what keeps
  it out of `check:node-imports`.
- **A subpath per binding** (`ui/plugin`, `ui/ai-context`, …). Four subpaths for
  seven exports, all bound to the same thing — the running admin — and each one
  a further public name to keep.

## The instance guard moved into itself

`assertSingleUiInstance` took the caller's `import.meta.url` and recorded it
under one global slot, which works while there is one barrel and false-positives
the moment there are two: the kit and the app barrel would report each other as
a second copy. The function now records
`packages/astromech/src/admin/support/ui-instance-guard.ts`'s own URL, so both
barrels call it and only a genuinely duplicated copy of the admin UI is
reported.

Both barrels do call it. The kit is config-free, not instance-free — it exports
`useFieldValue`, a React context hook, so a plugin resolving a second copy of
the kit alone still breaks, and that is the case a kit-only import site would
otherwise leave undetected. The guard itself is config-free: it imports
`utilities/registry` and nothing else. Its one Vite-ism, `import.meta.env.DEV`,
is read with `?.` because `import.meta.env` is undefined under plain Node, which
the kit now has to survive.

## What the check imports

`packages/astromech/scripts/check-node-imports.mjs` spawns Node against
`./dist/admin/components/ui/index.js` rather than the `astromech/ui` specifier.
In this repo that specifier resolves to TypeScript source
([0033](0033-the-repo-resolves-src-and-npm-gets-dist.md)), which no Node can
load; the built file is what npm resolves it to, so the built file is what the
claim is about.
