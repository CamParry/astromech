# Conventions and drift

How Astromech keeps its modules consistent without periodic clean-up sweeps.
A report shows where a branch adds a known drift pattern or a copy of existing
code, and a person decides at review whether it serves the wider consistency;
nothing here blocks a change for its shape alone. A rename lands with whichever
file already rewrites that code; this file holds the rest.

## Why

`roadmap/completed/` holds 17 naming, consistency and convergence passes. Each
aligned the code once, and the drift returned because a second copy of a
helper, a cast or a query key went unnoticed. Rules stated only in prose were
broken alongside the prose: the "one acknowledged cast" comment sits beside 20
casts, and the key factory's header beside seven inline keys.

Hard enforcement is the wrong fix. dependency-cruiser was meant to prevent
tangled dependencies and instead forced awkward shapes until it was removed
(`DECISIONS.md`, "Nothing enforces the layer model"). A report makes drift
visible where it happens and leaves the judgement to review.

## The drift report

- [x] `pnpm run report:drift` (`scripts/report-drift.mjs`): diffs the merge
      base of `--base` (default `main`) and HEAD against the working tree, so
      uncommitted work counts, and prints, per pattern, the lines a branch
      adds and removes in `packages/*/src`, `packages/plugins/*/src` and
      `apps/*/src`, tests excluded. A match the same file also removes is an
      edited line and is counted but not listed. Starting patterns:
      `as unknown as`; a literal `queryKey: [` outside
      `hooks/use-query-keys.ts`; `.type` compared with a core container or
      layout literal outside the fields directories; a comment saying code
      mirrors another module; a new `class …NotFoundError` or
      `class …ValidationError`; `collection` as an identifier. The pattern
      list is a plain array in the script, so adding one is a one-line
      change. It exits 0 whatever it finds.
- [x] Copies: the same report runs `jscpd` (defaults, 5 lines and 50 tokens,
      import statements ignored) over the same source directories and lists
      only clones with a side on a line the branch added, so existing
      duplication stays quiet until someone touches it. `--no-copies` skips
      it.
- [x] `verify` does not run it. It runs at review, before a branch merges,
      and its output goes in the merge summary with a decision for each item:
      share it now, add it to a roadmap file, or leave it with a reason.

## Study before changing a pattern

- [x] `AGENTS.md` workflow: before introducing or changing a pattern, find
      where it already repeats. Change every copy, record the rest in a
      roadmap file, or say why this one differs. A fix to a defect asks where
      else the defect can occur.
- [ ] `docs` skill: a roadmap item that fixes a defect names the class of
      defect, not only the instance.

## Tooling

- [ ] knip: add a `--production` pass to `check:unused` (entries marked `!`,
      tests excluded) so an export only tests use shows up; delete
      `EntryQueryResult`, `QueryOptions` and the re-exports outside `exports/`
      (`entries/repository/types.ts`, `entries/repository/table.ts`,
      `transport/tools/dispatch.ts`, `plugins/define-service-method.ts`,
      `database/drivers/d1.ts`).
- [ ] Typed lint for correctness only (`switch-exhaustiveness-check`,
      `no-unnecessary-type-assertion`) through `projectService`; measure the
      cost against `verify:fast`, and give it a check of its own if it is
      slow. The missing `globals` case in `utilities/ai-context.ts` is the
      kind of defect it catches.
- [ ] Stale text: `check:docs` also resolves backticked paths in
      `eslint.config.js`, `.claude/skills/` and source doc comments. Fix
      `decisions/0093` in `eslint.config.js`, `ARCHITECTURE.md`'s missing
      `entries/repository/versions.ts`, and the history comments (`Phase n`,
      `Pn/`, `spec §`, "pre-extraction", "the old") in `parse-fields.ts`,
      `references.ts`, `visibility.ts`, `binding.ts` and `types/plugins.ts`.

## Names

- [ ] Retire `collection` for an entry type and `record` for an entry: rename
      the 120+ `collection` identifiers and `EntryRecord`.
- [ ] Lookup verbs: swap `findGlobal` and `resolveGlobal`; `requireCanonical`
      and `requireRole` become `get*` or `assert*` outside middleware;
      `getSession` returns null; add the `find*` returns-null rule to the
      `code` skill and apply it (`readUser`, `readMedia`).
- [ ] `XTableRow`/`NewXTableRow` for table rows and `XRow` for joined rows;
      `toX` mappers (`asEntry`, `asGlobal`); singular repository factories;
      flatten `globals/repository/`; one name for a resource's plain
      repository (users' `accounts`, media's `files`); `globalGate`,
      `globalReadGate`, `globalAddressSchema`, `toUserRow`;
      `entries/unique.ts` into `internal/`; remove the banner headers.
- [ ] `code` skill sync: the repository-directory rule, the `ids` example and
      the `ServiceDefinition` note.
