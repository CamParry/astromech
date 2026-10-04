---
milestone: later
---

# Lint and type checks

From a comparison with Matt Pocock's course-video-manager
(https://github.com/mattpocock/course-video-manager, commit `58b4c0e`) on
2026-10-01, split out on 2026-10-02. Paths are under `packages/astromech/src/`
unless they start with a top-level folder; line numbers were taken on
2026-10-01 and may have drifted.

## Decided (2026-10-02)

- **The `no-unsafe-*` rules are turned on one by one**, amending "Type-aware
  lint catches defects, not style" in `DECISIONS.md` rather than reversing it:
  each hit is untyped data reaching typed code, which is a defect. The
  `recommendedTypeChecked` and `strictTypeChecked` presets stay rejected.
- **Break both import cycles, then allow none.** A test fails on any cycle, so
  there is no exemption list, which is what "Nothing enforces the layer model"
  in `DECISIONS.md` rejected dependency-cruiser for. Amend that entry, and
  correct the layer list in `ARCHITECTURE.md`.
- **No scheduled architecture review.** "Drift is reported, not enforced" in
  `DECISIONS.md` rejects periodic passes; `report:drift` runs before each merge.

## The work

- [ ] **Turn on the `no-unsafe-*` rules.** A trial run of the five rules
      finds 26 hits, all untyped data flows, e.g. `params: any` in
      `entries/internal/preview.ts:29` and an `any` stream chunk in
      `media/serving/handler.ts:31`. Add `@types/nodemailer` to remove the
      `@ts-ignore` in `email/drivers/smtp.ts:29`.
- [ ] **Check for import cycles.** Two exist: a five-file loop through
      `policies/scoped-services.ts`, `plugins/runtime/plugin-runtime.ts`,
      `plugins/runtime/plugin-services.ts`, `app-context/services.ts` and
      `app-context/app-context.ts`; and `database/registry.ts` with
      `database/transaction.ts`. Break both, then add a test like
      `tests/exports/shared-browser.test.ts` that fails on any cycle. Correct the layer list in `ARCHITECTURE.md` (transport and
      policies import the composition root).
- [ ] **Close the lint gaps in rules the docs say are enforced.** The
      ambient-read rule (`eslint.config.js:84-97`) matches `@/` specifiers
      only, so a relative import passes, and `.astro` files are not linted
      (`media/serving/image/Image.astro:12`). The admin's
      `no-restricted-imports` (`eslint.config.js:208-224`) misses a value
      import from the bare `astromech` root; add it with `allowTypeImports`.
- [ ] **Check the published types.** After `build`, fail if a bare import
      in `dist/**/*.d.ts` is not a dependency or peer dependency, and run
      `attw --pack`. `check:exports` checks key parity only, and
      `check:install` skips lib checks. Add `erasableSyntaxOnly` and
      `noImplicitOverride` to `packages/astromech/tsconfig.json` and
      `packages/schema-engine/tsconfig.json`; a trial run needs two `override`
      fixes.
