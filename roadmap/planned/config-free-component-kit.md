# A config-free component kit

`astromech/ui` is documented as the plugin-facing component surface and reads
like a component library. It is not one. Its barrel
(`packages/astromech/src/admin/components/ui/index.ts`) exports roughly 45 pure
atoms — `Button` through `Pagination` — alongside five things that need the
running admin: `useAstromechPlugin`, `useAIContext`, `useAIContextItems`,
`CommandPalette` and `ApiErrorPanel`.

A plugin author importing `Button` therefore pulls in a barrel whose first line
runs `assertSingleUiInstance(import.meta.url)`, and whose transitive graph
reaches `virtual:astromech/admin-config` and the fetch client. That is why
`astromech/ui` cannot be loaded by plain Node, and why
`packages/astromech/scripts/check-node-imports.mjs` deliberately leaves it out
of `SUBPATHS`.

Splitting the barrel is Payload's shape — `packages/ui` is the kit, and the
things that need the app live in the app.

## The two halves

**The kit.** Every component whose only inputs are its props: the form controls,
the layout primitives, the overlays, the feedback components. They import React,
`react-i18next`, `@base-ui/react`, `lucide-react`, tiptap and dnd-kit, and
nothing from `@/` outside `admin/components/ui/`.

**The config-bound exports**, with what binds each:

| Export                                                          | What binds it                                                                                                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAstromechPlugin`                                            | the fetch client and the admin's auth context                                                                                                |
| `CommandPalette`, `CommandPaletteProvider`, `useCommandPalette` | `virtual:astromech/admin-config`, plus the router, the query client and the entries surface — all three live in one module and move together |
| `useAIContext`, `useAIContextItems`                             | the admin's AI-context React context                                                                                                         |
| `ApiErrorPanel`, `dispatchApiErrorEvent`                        | the fetch client's `AstromechApiError` and its `emitApiError` event                                                                          |

## Change

- [x] Split `admin/components/ui/index.ts` into the kit barrel and an app-surface
      barrel, with the config-bound five re-exported from the second.
      `admin/components/ui/app.ts` holds them.
- [x] Decide what each published subpath points at. The kit keeps
      `astromech/ui` and the app surface is `astromech/ui/app`, a fourth
      subpath in both `exports` maps —
      `decisions/0054-the-kit-keeps-the-ui-name.md`.
- [x] Move `assertSingleUiInstance` off the kit barrel. Kept on both barrels
      instead, because the kit still exports `useFieldValue`: the guard now
      records its own module URL rather than the caller's, so two barrels are
      not mistaken for two copies. Reasoning in 0054.
- [x] Extend `packages/astromech/scripts/check-node-imports.mjs` to cover the
      kit subpath, which becomes loadable under plain Node once nothing in it
      reaches a virtual module. This is the check that keeps the split from
      silently regressing. It imports the kit's built entry, which is what npm
      resolves `astromech/ui` to.
- [x] Update the five plugin source files, two test mocks, two `apps/demo`
      files and three `apps/docs` pages that import from `astromech/ui`, plus
      `ARCHITECTURE.md` and `packages/plugins/AGENTS.md`. Four plugin files and
      one `apps/demo` file changed; the others import only kit components.

## The hard case

`useFieldValue` and `useAstromechPlugin` are React context hooks. A hook is only
useful to a plugin component if that component and the admin resolve to the
**same module instance** of the context, which is what
`boot/astro.ts`'s `astromech/ui*` aliases onto `pkgSrc` exist to guarantee and
what `admin/support/ui-instance-guard.ts` exists to detect the failure of.

Splitting the barrel does not remove that constraint, and shipping the kit as
built JS while the app stays as source would reintroduce it. `useFieldValue` in
particular sits in the kit's natural half — it is what a custom field renderer
calls — while being a context hook. So the kit is config-free, not
instance-free, and the `pkgSrc` alias stays in play either way.

## Notes / caveats

- This is worth doing on its own terms: it is what makes `astromech/ui`
  describable in one sentence, and it removes the surprise that a component
  import fails under Node.
- It is also prerequisite one for
  `roadmap/planned/admin-as-its-own-package.md`, which cannot decide where
  `astromech/ui` lives until the barrel stops being two things.
- Landable and verifiable while the admin is still in-package, which is the
  whole point of doing it first. Verify in `apps/demo` on port 4323; a barrel
  split that breaks a context identity typechecks fine.
