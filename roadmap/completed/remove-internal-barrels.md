# Remove internal barrels

Re-export barrels stay only where a published surface needs one; every other
`index.ts` re-export file goes, and imports point at the file that holds the
code. This file holds the rule and the work; the reasoning and the survey
evidence live in `DECISIONS.md`.

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

- `packages/astromech/src/transport/cli/index.ts` and
  `packages/astromech/src/transport/mcp/index.ts` — real code, but tsup entries,
  so the build resolves them by that path. The router's route pages under
  `packages/astromech/src/admin/pages/` are the same case, `index` being the URL
  segment.

Everything else imports files directly, and a file holding real code is named
for what it holds rather than for the directory it sits in.
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
- [x] Delete the one barrel the survey missed:
      `packages/astromech/src/integrations/cloudflare/index.ts`, whose only
      reader was `packages/astromech/src/exports/cloudflare.ts` — every other
      caller already imported `bindings.ts` directly.
- [x] Rename the real-code files that were left wearing an `index` name, none of
      them a build entry: `src/ai/index.ts` folded into `src/ai/models.ts`,
      `src/env/index.ts` to `src/env.ts`, `src/fields/rich-text/index.ts` to
      `render.ts` (dropping its one-line re-export of `parseRichText`),
      `src/transport/http/index.ts` to `app.ts`,
      `src/transport/http/client/index.ts` to `client.ts`, and
      `src/integrations/astro/index.ts` to `integration.ts`. The two collapsed
      directories held nothing else.
- [x] Trim `nonBarrelIndexModules` in `eslint.config.js` from thirteen paths to
      six: the type surface, the two tsup entries, the two `astromech/ui` alias
      targets, and the route pages.

## What it measured

Eighteen barrels went; 176 files changed in the first pass. The import-time
argument the ecosystem makes for this change did not reproduce here — vitest's
aggregate module-import time stayed inside its run-to-run variance on either
side, so the case rests on the cycle, the untrue `sideEffects`, the three
barrels nothing imported, and the 93% of imports that already named the
defining file.

## Not in scope

**`packages/astromech/src/types/index.ts`.** 363 imports, type-only, erased at
compile time. Rewriting them buys nothing at runtime; whether the type surface
should be one file is a separate question.

**The `'@/'` Vite alias and the browser boundary.** That seam belongs to
`roadmap/planned/browser-boundary-enforcement.md`.
