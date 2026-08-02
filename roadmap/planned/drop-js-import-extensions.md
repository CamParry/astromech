# Drop `.js` Import Extensions

Source files are `.ts`/`.tsx` but ~1157 of the 1239 relative/alias imports in
`packages/astromech/src` are written as `from '@/foo/bar.js'`. It reads as a mismatch and
is a constant small friction when navigating or authoring imports.

**The extensions buy us nothing here.** The `.js` suffix is a Node ESM _runtime_
requirement — Node's loader does no extension resolution, and TypeScript deliberately never
rewrites import specifiers, so under `moduleResolution: "node16"/"nodenext"` what you type
must already be the emitted path. We are not in that case:

- `packages/astromech/tsconfig.json` (and every other package tsconfig) sets
  `"moduleResolution": "bundler"` — extensions are optional by design.
- The build is tsup/esbuild, which bundles and resolves the graph itself. Nothing ever
  resolves these specifiers at runtime.
- Extensionless imports already work and typecheck today —
  `src/database/storage/relationships.ts` and all of `src/admin/routeTree.gen.ts` (which
  TanStack Router generates without extensions, so the codebase can't be uniform anyway).

## Change

- [ ] Codemod `from '(\.{1,2}/|@/|@tests/)…\.js'` → drop the `.js`, across `packages/*/src`,
      `packages/plugins/*/src`, and `packages/*/tests`. Also covers `import type`,
      `export … from`, dynamic `import()`, and `vi.mock()` specifiers.
- [ ] Add an eslint rule pinning the convention (`import-x/extensions` set to `never` for
      ts/tsx, or equivalent) so it doesn't drift back.
- [ ] Verify: `npm run typecheck`, `npm run lint`, full test suite, `npm run build`, plus a
      demo boot — the specifiers that resolve through Vite/Astro rather than tsup
      (`exports` entries pointing at raw `src/routes/*.ts`) should be exercised, not just
      typechecked.

## Notes / caveats

- Roughly a 1400-line mechanical diff. Land it on its own branch, in one commit, when no
  other large refactor is mid-flight — it will conflict with anything touching imports
  (currently: entries-module-reshape, ai-integration — table-definition-system and
  field-validation have since landed). **Do this after those land, not before.**
- The one thing the extensions preserve is portability to a tsc-emitted `nodenext` build.
  That is not the plan (tsup is the build), so this is an accepted trade.
- Alternative considered and rejected: TS 5.7+'s `rewriteRelativeImportExtensions` (write
  `./foo.ts`, tsc rewrites to `./foo.js` on emit). It solves this for projects that emit
  runtime ESM from tsc — irrelevant to a bundled build, and it would mean adding extensions
  rather than removing them.
