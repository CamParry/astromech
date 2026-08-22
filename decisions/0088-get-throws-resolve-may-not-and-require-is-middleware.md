# 0088 — `get` throws, `resolve` may return undefined, `require` is middleware

**Date:** 2026-08-22
**Status:** accepted

Four verbs were being used for "fetch a thing, complain if it isn't there", and
the one reached for most often was the one TypeScript already owns. This record
fixes the vocabulary and reverses a name accepted four days earlier in
`roadmap/completed/entries-naming-consistency.md`.

## The rule

- **`get*` returns the thing and throws when it is absent.** `getConfig()` is
  `config.getOrThrow` and has always worked this way; `registry.ts` exposes
  `getOrThrow` as the primitive. No `OrThrow` suffix on the caller's name — the
  suffix belongs to the registry primitive, not to every function built on it.
- **`resolve*` returns the thing or `undefined`.** `resolveEntryType`,
  `resolveContentLocale`, `resolveTypeFields`.
- **`assert*` returns `void`.** `assertCapability`, `assertEntryTypeValid`,
  `assertUniqueDataNames`. TypeScript's own `asserts x is T` form is void by
  definition, so a value-returning `assert` fights the language.
- **`require*` is reserved for middleware.** `requireAuth` in
  `transport/http/middleware/auth.ts` is the Express and Hono name for a gate in
  a request pipeline, and that is the only thing the prefix should mean here.

`operations/get.ts` `getEntry` returning `null` is a deliberate exception: on
the public read path a missing entry is a 404, not a fault. An exception to the
`get` rule has to be one a caller would be surprised to see throw.

## What changed

`requireTrash` and `requireStaging` are deleted. They asserted an entry type's
capability and returned the repository's narrowed `trash` or `staging` group.
Their call sites now do it inline:

```ts
const repository = getEntryRepository(type);
assertCapability(type, 'trash');
const { trash } = repository;
if (!trash) throw new CapabilityError(type, 'trash');
```

`requireStaging` previously threw a bare `Error` mentioning "built-in storage
required" while `requireTrash` threw `CapabilityError`. Both now throw
`CapabilityError`.

`internal/records.ts` `loadAndAssertType` and `loadEntries` become
`getEntryOfType` and `getEntriesOfType`.

## Why the wrappers went rather than being renamed

They wrapped a check with no logic in it. `assertCapability` does the real
work — it reads the resolved config, where an author who writes
`trash: false` on a type gets `capabilities.trash === false` while the
repository still exposes `repository.trash`, because the built-in repository is
a config-free singleton. The second half, `if (!trash)`, never fires at runtime:
`config/entry-types.ts` `assertEntryTypeValid` crashes at boot if a type
declares a capability its repository lacks. It exists to narrow the type.

A wrapper whose only content is a type narrowing costs a reader a file hop to
learn that `trash` is a member of the repository they already hold. The two
wrappers also had mirror-image signatures — `requireTrash(repository, type)`
returned the group, `requireStaging(type)` returned `{ repository, staging }` —
so neither could be guessed from the other.

## The local survives, because TypeScript discards the narrowing

The obvious inline form, `repository.trash.trash(id)`, does not compile.
TypeScript drops property narrowing inside a closure even off a `const` binding,
and the trash and restore writes happen inside `transaction(async () => { … })`.
Verified:

```ts
const repository = getRepo();
if (!repository.trash) throw new Error('no trash');
await repository.trash.trash('a'); // fine
await transaction(async () => {
    await repository.trash.trash('b'); // TS18048: possibly 'undefined'
});
```

An assertion-function `assertCapability` narrowing the repository does not help;
assertion narrowing is discarded in closures too. So a destructured local is
required. What was removed is the cross-file indirection, not the variable.

## Why `getEntryOfType`, not `getEntryOrThrow`

`getEntryOrThrow` reads as "`getEntry`, but throws", and the two differ by more
than that: it includes trashed rows and applies no visibility filter. A reader
who swapped one for the other on the strength of the name would silently change
which rows come back and who may see them. The suffix would advertise a pair
where the real difference is what the function reads.

`getStoredEntry` was considered and dropped: every entry is stored, and
`toStoredFields` uses "stored" for the stored _shape_, a different sense
(`decisions/0086`).

`assertEntryExists` was considered and dropped: it is right for the five call
sites that discard the row and wrong for the nine that use it, and serving both
means either two names for one behaviour or copying the type-mismatch guard into
nine files. That guard is security-relevant — without it an operation addressed
at one type can read and mutate a row of another.

## Reversing `entries-naming-consistency`

That roadmap item renamed `getStagingRepository` to `requireStaging` "matching
its neighbour `requireTrash`", four days before this record. It made two names
consistent with each other without asking whether the shared prefix was right.
The completed roadmap file stays as written, and `decisions/0085`, which quotes
`requireTrash(repository, type)`, is append-only and stays as written too. Both
are accurate records of what was true when they were written.

## Consequences

- `transport/cli/commands/methods.ts` `requireRole` and
  `integrations/astro/index.ts` `requireLoaded` both return values and are
  misnamed under this rule. They are outside `entries/` and are not renamed
  here.
- The `code` skill's Naming section gains the four verbs.
