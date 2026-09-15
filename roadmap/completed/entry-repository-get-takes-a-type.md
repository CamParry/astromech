# `EntryRepository.get` takes a type

`get` cannot tell a caller whether the row it found belongs to the type the
caller asked for, so every by-id operation re-checks that itself after the read.
This file moves the type into the read.

## What was true at the start

- `get(ref, opts)` and `anyLocale(id, opts)` in
  `packages/astromech/src/entries/repository/types.ts` take no type. The
  entries-table repository holds every type in one table, so either can return
  a row of another type.
- `packages/astromech/src/entries/internal/records.ts` checks the type after the
  read and throws `EntryTypeMismatchError`. The HTTP error handler does not map
  it, so REST answers a wrong-type id with a 500.
  `packages/astromech/src/entries/methods/get.ts` and
  `packages/astromech/src/entries/internal/preview-read.ts` repeat the check
  inline and answer null instead. No test covers either path.
- `EntryRepository` is internal. `DECISIONS.md` rules out custom-built
  repositories, and `EntryType['repository']` accepts only `tableRepository`, so
  changing the signature breaks nothing outside core.
- The restore methods for entries and globals throw a bare
  `Error('Version not found')`, which REST answers with a 500. Media and users
  throw their own not-found error for the same case.

## Decisions

- **The type is part of the address.** `get({ type, id, locale }, opts)` and
  `anyLocale({ type, id }, opts)`, with `type` required: both implementations
  are in core.
- **A row of another type is not found.** The entries-table repository answers
  null for it, so a by-id operation throws `EntryNotFoundError` and REST answers 404. Payload and Strapi answer the same way for an id from another collection.
  `EntryTypeMismatchError` is deleted. `tableRepository` holds one type, so it
  ignores the field.
- **`getEntryOfType` and `findEntryOfType` keep their names.** Once the
  repository scopes the read, they resolve the default locale and throw on a
  miss, and the names still say what they return.
- **A missing version is its resource's not-found error**, as media and users
  already do.

## The work

- [x] `get` and `anyLocale` take the type. The entries-table repository answers
      null on a mismatch; `tableRepository` ignores the type.
- [x] The records helpers, `get`, the preview read and the shared-fields read
      pass the type and drop their own checks. `EntryTypeMismatchError` is
      deleted.
- [x] Entry and global restore throw their resource's not-found error for a
      missing version, and `CapabilityError` when the repository keeps no
      versions.
- [x] Tests cover a wrong-type id through the repository, the service and REST,
      and a missing version through REST.
- [x] `DECISIONS.md` records the choice.
