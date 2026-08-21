# Entries naming consistency

A naming audit of `packages/astromech/src/entries/` — root files, `internal/`
and `jobs/`. `decisions/0085-entry-type-is-one-word-in-the-entries-domain.md`
holds the vocabulary and what the alternatives were; this file holds the edits.

Mechanical throughout. No behaviour changes.

## The work

- [x] **Rename `packages/astromech/src/entries/type-ids.shared.ts` to
      `entry-types.shared.ts`.** Twenty-one importers, plus
      `packages/astromech/tests/entries/entry-types.test.ts`. `ARCHITECTURE.md`
      needed no edit in the end: it was rewritten while this was in flight and
      the three references went with it.
- [x] **`typeName` → `type`** in `packages/astromech/src/entries/internal/entry-type.ts`
      and `packages/astromech/src/entries/internal/relationships.ts`, the only
      two files in the package that still used it.
- [x] **`getStagingRepository` → `requireStaging`**, matching its neighbour
      `requireTrash`. Both assert a capability and return the narrowed
      repository group, so they now read as the same operation.
- [x] **Rename `type-config.ts` to
      `packages/astromech/src/entries/internal/entry-type.ts`.**

`tableBackedEntrySources` in
`packages/astromech/src/entries/internal/relationships.ts` takes `typeId` as its
loop variable. Renaming the parameter to `type` would otherwise have shadowed
it, and `type` is the right name for the parameter because its sibling
`builtInEntrySources` already uses it.

## Looked at and deliberately not changed

**`resolveTypeFields` versus `getNonTranslatableFieldNames`** were listed as one
shape wearing two verbs. On reading them they are two operations:
`resolveTypeFields` resolves a type id to its fields, and
`getNonTranslatableFieldNames` intersects a caller-supplied list with the type's
non-translatable fields. A resolution and a filter. Both names are right.

**`getDefaultLocale` stays in `internal/entry-type.ts`.** It takes no type, which
is what made the old filename look wrong, but it does read the resolved config
like everything else in the file. Moving it wants a home: `utilities/locale.ts`
is a pure leaf and may not import `config/registry`, so the move is a
cross-layer change rather than a rename, and out of scope here.

## Handed on

The three `.shared` stems in `entries/` still disagree. That question moved to
`roadmap/planned/browser-boundary-enforcement.md`, because it cannot be settled
before that item decides whether the suffix survives at all.

## Checked and left alone

`jobs/` is consistent: `scheduled-publish.ts` exports `scheduledPublishJob`,
`trash-purge.ts` exports `trashPurgeJob`, and `jobs/index.ts` exports
`entryJobs`.

`internal/dangling-relations.ts` versus `internal/relationships.ts` and
`internal/deep-equal.ts` versus `utilities/values-equal.ts` are covered in
`decisions/0085-entry-type-is-one-word-in-the-entries-domain.md`; both are
correct as they stand. The three identical `internal/validate.ts` files were
dissolved by `decisions/0086-one-validate-per-layer.md` while this was in
flight.
