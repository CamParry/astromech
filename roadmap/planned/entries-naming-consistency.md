# Entries naming consistency

A naming audit of `packages/astromech/src/entries/` — root files, `internal/`
and `jobs/`. `decisions/0085-entry-type-is-one-word-in-the-entries-domain.md`
holds the vocabulary and what the alternatives were; this file holds the edits.

Mechanical throughout. No behaviour changes.

## The work

- [ ] **Rename `packages/astromech/src/entries/type-ids.shared.ts` to
      `entry-types.shared.ts`.** Twenty-one importers. Also rename
      `packages/astromech/tests/entries/type-ids.test.ts` to match. Update the
      three backticked paths in `ARCHITECTURE.md`; `decisions/` and
      `roadmap/completed/` are exempt from `pnpm run check:docs` by
      `scripts/check-docs-links.mjs`, so their references to the old path stay
      as written.
- [ ] **`typeName` → `type`** in `packages/astromech/src/entries/internal/type-config.ts`
      (sixteen uses) and `packages/astromech/src/entries/internal/relationships.ts`
      (eleven). These are the only two files in the package still using it.
- [ ] **Settle the verb prefixes in
      `packages/astromech/src/entries/internal/type-config.ts`.** Two operations
      wear four verbs: `resolveTypeFields` and `getNonTranslatableFieldNames`
      both read config and return a value; `requireTrash` and
      `getStagingRepository` both assert a capability and return the narrowed
      repository group. Pick one verb per shape.
- [ ] **Rename `type-config.ts`, or split it.** The header says every export
      reads the resolved config, but `isVersioningEnabled` and
      `getStagingRepository` also call `getEntryRepository`, and
      `getDefaultLocale` takes no type at all. `entry-type.ts` fits what is left
      after `getDefaultLocale` moves.

## Decide when the first three land

- [ ] **The three `.shared` stems disagree.** `entry-url.shared.ts` prefixes with
      `entry-`; `type-ids.shared.ts` and `validation-mode.shared.ts` do not, and
      `validation-mode.shared.ts` exports `entryValidationMode`, so the export
      is prefixed and the file is not. Inside `entries/` the prefix is arguably
      redundant, which argues for `url.shared.ts`; `entry-url` reads better at
      the import site. Worth settling only once
      `roadmap/planned/browser-boundary-enforcement.md` decides whether the
      suffix survives at all.

## Checked and left alone

`jobs/` is consistent: `scheduled-publish.ts` exports `scheduledPublishJob`,
`trash-purge.ts` exports `trashPurgeJob`, and `jobs/index.ts` exports
`entryJobs`.

`internal/dangling-relations.ts` versus `internal/relationships.ts`,
`internal/deep-equal.ts` versus `utilities/values-equal.ts`, and the three
identical `internal/validate.ts` files are covered in
`decisions/0085-entry-type-is-one-word-in-the-entries-domain.md` — the first two
are correct as they stand, and the third belongs to
`roadmap/in-progress/validation-naming-and-navigability.md`.
