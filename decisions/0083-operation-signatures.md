# 0083 — Operations are named verb plus noun and take the record as one nested object

**Date:** 2026-08-21
**Status:** accepted

Two rules govern every function under `packages/astromech/src/entries/operations/`,
`packages/astromech/src/users/operations/` and
`packages/astromech/src/media/operations/`:

1. The name is a verb plus a noun, and the noun carries plurality:
   `createEntry`, `getUser`, `queryMedia`, `updateEntries`, `listEntryVersions`.
2. Addressing (`type`, `id`, `ids`, `key`) sits at the top level of the
   parameter object; the record being written sits under one key, `data`.

The public service keys are unaffected: `app.entries.create`, `app.users.get`
and `app.media.usedBy` read as they always have.

## Context

The operations directories grew one verb at a time, so they had no single
shape. `create`, `get`, `query` and `duplicate` named no noun while
`updateEntries`, `trashEntries` and `deleteUser` did, which meant three
identically-named `create` functions in three domains and an import list in
`service.ts` that said nothing about what it imported. The parameter shapes
diverged the same way: `update` took `{ type, id, data }` while `create` spread
the row flat across the params object beside `type`, so the two halves of the
same CRUD pair could not be read as variations of one thing.

Neither is a correctness problem. Both are a cost paid on every read, and the
cost compounds: a reader who has learned one operation has learned nothing
transferable about the next.

## Decision

**The noun carries plurality, not the verb.** `updateEntries` takes `ids`;
`getEntry` returns one row. This is why the rename is worth more than
consistency alone: after 0082 made the operations batch-only, the name is now
the only place the arity is visible at a glance, and `updateEntries` reads
correctly for the batch it now is. `media` is uncountable, so `getMedia` and
`queryMedia` are both right and the plurality signal is simply absent there.

**The record is one nested object.** `data` is the key, matching what `update`
already did and what the wire calls it. Two places keep a more specific word,
and they are the exceptions rather than oversights:

- `duplicateEntry({ type, id, overrides })` — `overrides` says these values
  replace the copied row's. `data` would describe the shape and lose the
  meaning.
- `settings.set({ key, value })` — a setting's value can be a scalar, so it is
  not a record and `data` would misdescribe it.

The principle: uniformity is worth having until it costs a reader information,
and a name that says what the object does beats a name that says only that an
object is there.

**`locale` and `localeGroup` go inside `data`,** not beside `type`, even though
they are write-once and `update` cannot carry them. `duplicateEntry`'s
`overrides` is the one existing bucket that holds them; a third top-level slot
would be a pattern nothing else in the codebase uses.

**The wire does not change.** `POST /entries/:type` and `POST /users` keep their
flat bodies. The route specs declare `bodyKey: 'data'`, the mechanism
`entries.update` and `media.update` already used, so the generated client sends
that key alone as the body and the OpenAPI document describes the body from it.

## Consequences

The RPC transport reports validation field paths one level deeper for the two
`create` methods. `POST /rpc/:id` passes the whole request body to the contract
schema and calls `fromZodError` with no `bodyKey`
(`packages/astromech/src/transport/http/routes/rpc.ts`), so a rejected field is
named `data.email` rather than `email`. This is what the argument object
actually looks like on that transport, and it is what `users.update` already
reported. The REST routes are unaffected, because `bodyKey` rebases the path
back onto the flat body the caller sent.

## Rejected

- **Leaving the short names and relying on the file path for the noun.**
  `import { create } from './operations/create'` is unambiguous at the import
  and ambiguous everywhere else, including at the three call sites in
  `service.ts` where three domains' `create` functions would otherwise need
  aliasing to coexist.
- **Renaming the service keys too.** `app.entries.createEntry` stutters, and the
  service is addressed through its domain object, which already supplies the
  noun.
- **Making `duplicate` take `data` for uniformity.** Considered and dropped:
  the values in that object exist to override the copy, and flattening the name
  to match its neighbours would have traded a reader's understanding for a
  table that looks tidier.
- **Putting `locale` and `localeGroup` beside `type`** as a second addressing
  group. Defensible (they are not patchable), but it invents a third slot for
  two fields and splits the create payload across two objects.
