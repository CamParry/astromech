# 0085 — `type` is the parameter, `entry-types` is the file

**Date:** 2026-08-22
**Status:** accepted

A naming audit of `packages/astromech/src/entries/` found one concept carrying
three names and one file named after neither. This record fixes the vocabulary.
The work is `roadmap/planned/entries-naming-consistency.md`.

## The parameter is `type`

An entry type's identifier is called `type` in every operation, in `service.ts`,
in `schema.ts` and in every `EntriesService` method. Two files disagreed:
`internal/type-config.ts` and `internal/relationships.ts` called it `typeName`,
and `internal/type-config.ts` used both — `requireTrash(repository, type)` calls
`assertCapability(type, 'trash')` four lines below `assertCapability`'s own
`typeName` parameter.

`type` wins because it is what the public surface already says, and because a
caller reading `entries.update({ type, ... })` should not meet a second word for
the argument they just passed.

`typeName` loses on accuracy as well as on count. A plugin's entry type is
addressed as `redirects/redirect`, which `TERMINOLOGY.md` calls a qualified id.
That is not a name.

`typeId` loses on redundancy inside the domain: within `entries/`, `type` is
unambiguous, and the suffix earns its place only where a `type` of another kind
is in scope — which is why `permissions/entry-permission.ts`,
`codegen/method-manifest.ts` and `entries/methods.ts` keep it.

## The file is `entry-types.shared.ts`

`entries/type-ids.shared.ts` exports `parseEntryTypeId`, `qualifyEntryType` and
`resolveEntryType`. Every symbol in it says entry type; the filename said type
ids, which names the arguments rather than the subject.

`entry-types` matches `transport/http/routes/entry-types.ts`, which already uses
that stem for the same subject.

`entrytypes.ts` was considered and lost: every filename in the package is
kebab-case, and dropping the separator makes the word harder to read for nothing.

The `.shared` suffix is kept for now, against the instinct to drop it. It marks
nothing enforceable — `0084` is the record of why — but retiring it is a
boundary decision, not a naming one, and doing both in one pass would tie a
mechanical rename to a blocked one.

## Also found, deliberately not changed

`internal/dangling-relations.ts` and `internal/relationships.ts` use different
words for different things, which `TERMINOLOGY.md` already distinguishes:
a **relation** is the field type, **relationships** is the derived index. The
file headers say so. This reads as drift and is not.

`internal/deep-equal.ts` and `utilities/values-equal.ts` are two names for one
concept, but genuinely different functions — the first recurses key-order
insensitively, the second compares `JSON.stringify` output. Left alone; a rename
that implied they were interchangeable would be worse than the duplication of
vocabulary.

`entries/internal/validate.ts` is byte-identical to its `users/` and `media/`
siblings. That is owned by
`roadmap/in-progress/validation-naming-and-navigability.md`, which deletes all
three, and is not touched here.
