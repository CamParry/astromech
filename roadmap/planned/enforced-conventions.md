# Enforced conventions

Each rule in the `code` and `ui` skills is held by a type, a lint rule or a
test, or is marked review-only, so the gate catches what the September audit
found by reading. A rename lands with whichever file already rewrites that
code; this file holds the rest.

## Why

`roadmap/completed/` holds 17 naming, consistency and convergence passes. Each
aligned the code once, and the drift returned because nothing makes a second
copy fail. Rules stated only in prose are already broken: the "one
acknowledged cast" comment sits beside 20 casts, the key factory's header
beside seven inline keys, and the `code` skill's lookup verbs beside an
inverted `findGlobal`/`resolveGlobal`.

## The work

- [ ] knip: add a `--production` pass to `check:unused` (entries marked `!`,
      tests excluded) so a test-only export fails; delete `EntryQueryResult`,
      `QueryOptions` and the re-exports outside `exports/`
      (`entries/repository/types.ts`, `entries/repository/table.ts`,
      `transport/tools/dispatch.ts`, `plugins/define-service-method.ts`,
      `database/drivers/d1.ts`).
- [ ] Typed lint over a short list (`switch-exhaustiveness-check`,
      `no-unnecessary-type-assertion`) through `projectService`; measure the
      cost against `verify:fast`, and give it a check of its own if it is
      slow.
- [ ] Retired words: `@typescript-eslint/naming-convention` refusing
      `collection` (use entry type) and `record` for an entry; rename the 120+
      `collection` identifiers and retire `EntryRecord`.
- [ ] Lookup verbs: swap `findGlobal` and `resolveGlobal`; `requireCanonical`
      and `requireRole` become `get*` or `assert*` outside middleware;
      `getSession` returns null; add the `find*` returns-null rule to the skill
      and apply it (`readUser`, `readMedia`).
- [ ] Names: `XTableRow`/`NewXTableRow` for table rows and `XRow` for joined
      rows; `toX` mappers (`asEntry`, `asGlobal`); singular repository
      factories; flatten `globals/repository/`; one name for a resource's plain
      repository (users' `accounts`, media's `files`); `globalGate`,
      `globalReadGate`, `globalAddressSchema`, `toUserRow`;
      `entries/unique.ts` into `internal/`; remove the banner headers.
- [ ] `code` skill sync: the repository-directory rule, the `ids` example, the
      `ServiceDefinition` note, and "a second copy moves to the shared module".
- [ ] Stale text: `check:docs` also resolves backticked paths in
      `eslint.config.js`, `.claude/skills/` and source doc comments, and
      refuses history markers in comments (`Phase n`, `Pn/`, `spec §`,
      "pre-extraction", "the old"). Fix `decisions/0093` in
      `eslint.config.js`, `ARCHITECTURE.md`'s missing
      `entries/repository/versions.ts`, and the comments in `parse-fields.ts`,
      `references.ts`, `visibility.ts`, `binding.ts` and `types/plugins.ts`.
- [ ] `docs` skill: a roadmap item that fixes a defect names the class of
      defect and the check that stops the next instance.
