# Remove internal barrels

Re-export barrels stay only where a published surface needs one; every other
`index.ts` re-export file goes, and imports point at the file that holds the
code. This file holds the rule and the work; the reasoning and the survey
evidence live in `decisions/0093-barrels-are-entry-points-not-navigation.md`.

## The rule

A re-export barrel may exist only as the target of a published surface:

- `packages/astromech/src/exports/` — the subpath entry points.
- `packages/astromech/src/admin/components/ui/index.ts` and
  `packages/astromech/src/admin/components/fields/index.ts` — the Vite alias
  targets for `astromech/ui` and `astromech/ui/fields`.
- Package roots: `packages/schema-engine/src/index.ts`, each plugin's
  `src/index.ts` and `src/tables/index.ts`.
- `packages/astromech/src/types/index.ts` — type-only, erased at runtime, and
  the type surface is one deliberate unit.

Everything else imports files directly. A file named `index.ts` that holds real
code rather than re-exports (the integrations, `transport/*`, `ai/`,
`fields/rich-text/`) is not a barrel and is not covered here.
`eslint.config.js` carries the rule and the list of exceptions.

## The work

- [x] Delete the three barrels with zero importers:
      `packages/astromech/src/database/index.ts`,
      `packages/astromech/src/cron/index.ts`,
      `packages/astromech/src/config/index.ts`.
- [x] Fix the one real cycle: `packages/astromech/src/admin/hooks/use-entry-form.ts`
      imports `useHotkeys` from `./index`, which re-exports `use-entry-form`.
- [x] Fold the single-consumer barrels into their entry points:
      `packages/astromech/src/exports/email.ts` and
      `packages/astromech/src/exports/fields.ts` re-export the leaves directly;
      `packages/astromech/src/email/index.ts` and
      `packages/astromech/src/fields/index.ts` are deleted.
- [x] Split the mixed barrels — real code moves to a named file, re-exports go:
      `packages/astromech/src/entries/index.ts` (`typedEntriesService`),
      `packages/astromech/src/entries/jobs/index.ts` (`entryJobs`),
      `packages/astromech/src/permissions/index.ts` (the permission catalogue
      and role resolution).
- [x] Retire the remaining pure internal barrels (`errors`, `request-context`,
      `hooks`, `media`, `users`, `settings`, `notifications`, `cron/drivers`,
      `admin/hooks`) and rewrite their importers to file paths, tests
      included. Two mocks were bound to the barrel path:
      `vi.mock('@/admin/hooks/index', …)` in
      `packages/astromech/tests/admin/components/plugins/plugin-slot.test.tsx`
      and
      `packages/astromech/tests/admin/components/entries/entry-edit-locale-switch.test.tsx`.
- [x] Scope the side-effect declaration: `packages/astromech/package.json` said
      `"sideEffects": false` while two modules called `assertSingleUiInstance()`
      at module scope, which a bundler is entitled to drop.
- [x] Enforce the rule: a `no-restricted-syntax` selector in `eslint.config.js`
      rejecting re-export barrel imports outside the allowed set, so the
      convention is lint, not folklore.
- [x] Update the map: the barrel sentences in `packages/astromech/AGENTS.md`
      and `ARCHITECTURE.md` say what the rule is now.

## What it measured

Seventeen barrels went; 176 files changed. The import-time argument the
ecosystem makes for this change did not reproduce here — vitest's aggregate
module-import time stayed inside its run-to-run variance on either side, so the
case rests on the cycle, the untrue `sideEffects`, the three barrels nothing
imported, and the 93% of imports that already named the defining file.

## Not in scope

**`packages/astromech/src/types/index.ts`.** 363 imports, type-only, erased at
compile time. Rewriting them buys nothing at runtime; whether the type surface
should be one file is a separate question.

**Renaming real-code `index.ts` files.** Cosmetic, and touching the CLI and
integration entry files churns tsup config for no structural gain.

**The `'@/'` Vite alias and the browser boundary.** That seam belongs to
`roadmap/planned/browser-boundary-enforcement.md`.
