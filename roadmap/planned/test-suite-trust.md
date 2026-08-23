# Test suite trust

A 2026-08-24 review of the suite's quality: what it covers, what it only
appears to cover, and the conventions work that keeps it honest. Making the
gate fast is a separate problem with its own file:
[verification-gate-speed](verification-gate-speed.md).

## What is actually true today

The suite is stronger than its bolted-on history suggests. 2,996 tests across
241 files, none skipped. The core harness
(`packages/astromech/tests/_support/harness.ts`) builds a real file-backed
libsql database and applies the actual committed migration chain from
`apps/demo/migrations`, so most tests exercise real SQL, FK enforcement and
transactions. Mocking is rare (38 `vi.mock` calls in 28 files) and mostly
confined to the session boundary and the AI SDK. Permission and HTTP route
coverage is thorough, including privilege-escalation cases.

The problems sit at the edges and in the conventions:

- **The real session path is never exercised.** `packages/astromech/src/users/session.ts` is
  mocked in every test that touches it, so nothing covers the Better Auth
  session to `User` + `Role` translation, and nothing asserts what
  `resolveRole()` does with an unknown slug. That function currently fails
  open to admin ([role-resolution-fails-open](role-resolution-fails-open.md)),
  and the suite is blind to both the bug and any fix.
- **Everything behind admin login has no coverage of any kind.** Not unit, not
  integration, not boot: `scripts/check-boot.mjs` stops at the login screen by
  design, and `src/admin/pages/` has zero test files. This is the largest gap
  in the project.
- **Whole subsystems are untested**: the Astro integration
  (`packages/astromech/src/integrations/astro/`, six modules whose only
  coverage is a full `astro build`), `src/config/load.ts`, the email drivers,
  and the entire `@astromech/seo` plugin (627 lines, twelve files, no tests).
- **Plugin tests cannot grow where they belong.** The first-party plugins are
  tested from `packages/astromech/tests/plugins/` via vitest aliases; the
  plugin packages themselves have no `tests/` directories, and root `test:run`
  only runs schema-engine, core and assistant, so a plugin suite added in its
  own package would never run.
- **A handful of tests cannot fail**, most clearly
  `tests/plugins/redirects/schema.test.ts` (asserts only that the harness
  created tables) and the no-throw assertions in
  `tests/admin/components/fields/richtext-field.test.ts`.
- **Wall-clock sleeps are the flake surface**: ~15 places use `setTimeout`
  where `waitFor`/`findBy*` (admin components) or `vi.setSystemTime` (timestamp
  separation in DB tests) belong.
- **The tree and the docblocks describe an older codebase.**
  `tests/services/` mirrors a `src/services/` that no longer exists, contrary
  to the nested `AGENTS.md`, and roughly eight docblocks still narrate shipped
  refactors ("Phase 2, slice 2b", "in-memory database" over a file-backed
  harness, a dead cross-reference to `src/services/entries/service.test.ts`).
- **No conventions are written down**, and it shows: 196 `it('should …')`
  names in some files against declarative names elsewhere, 28 files on
  `@testing-library/react` against 21 on hand-rolled `createRoot`, barrel
  mocks beside leaf mocks.
- **Nothing is measured.** Coverage is not configured and no provider is
  installed, so "which subsystem is thin" is only answerable by manual audit.

## The work

Ordered so the cheap fixes land before the conventions they depend on stop
being enforced by memory.

- [ ] Test `getSession()` and `resolveRole()` against the harness database
      instead of mocking `@/users/session` at its five call sites: valid session
      resolves the right role, deleted user resolves to nothing, and an unknown
      `roleSlug` asserts whichever behaviour
      [role-resolution-fails-open](role-resolution-fails-open.md) settles on.
- [ ] Write a `testing` skill: present-tense test names, one React rendering
      approach (`@testing-library/react`), mock leaves not barrels, no wall-clock
      sleeps, where a new test file goes, and the per-file-isolation dependency
      the registry-wiping tests rely on.
- [ ] Replace the `setTimeout` sleeps (eight admin files, six DB files) with
      `waitFor`/`findBy*` and `vi.setSystemTime`.
- [ ] Delete `tests/plugins/redirects/schema.test.ts`, rewrite the weak
      assertions in `richtext-field.test.ts`, and add real redirects coverage:
      `service/redirects.ts` matching and `hooks/slug-change.ts`.
- [ ] Sweep the stale docblocks, and make the tree claim true: either rename
      `tests/services/` and `tests/db/` to mirror today's `src/`, or fix the
      nested `AGENTS.md` to describe the layout that exists.
- [ ] Export the shared fixtures (`noopStorage`, `noopDriver`, the role
      helpers) from `_support/` and replace the ~22 local copies.
- [ ] Give each first-party plugin package its own `tests/` directory and
      `test:run` script, wire them into root `test:run`, and write the seo
      plugin's first tests (`utilities/length.ts`, `utilities/meta-value.ts`,
      `service/seo.ts`).
- [ ] Cover the Astro integration with unit tests: the emitted virtual module,
      the injected route paths, and the `optimizeDeps.include` versus
      `publicHoistPattern` parity check that currently costs a `check:boot` run to
      discover.
- [ ] Turn on coverage (`@vitest/coverage-v8`) with per-directory thresholds,
      not one global number.
- [ ] Extend verification past login: either grow the `check:boot` browser
      step or add an authenticated pass covering the entries list and one entry
      edit. Largest item here, and the one both this review and
      `scripts/check-boot.mjs`'s own comments name as the biggest gap.
