# Consistent operation signatures

Make every operation function under `entries/`, `users/` and `media/` guessable
from any other: the record payload is one nested object, and the function name
is verb plus noun, with the noun carrying plurality. The public service objects
(`app.entries.create`, `app.users.update`, …) keep their short names; this is
about the functions in `operations/` and the parameter shapes both layers share.

## Rule 1 — the record is one nested object

Addressing (`type`, `id`, `ids`, `key`) sits at the top level. The record being
written sits under one key. That key is `data` unless a more specific word says
what the object does, which is the case in two places and they stay:

- `duplicate({ type, id, overrides })`: `overrides` says these values replace
  the copied row's; `data` would not.
- `settings.set({ key, value })`: a setting's `value` can be a scalar, so it is
  not a record and `data` would misdescribe it.

What is out of step today, per the inventory:

| Method           | Today                                                                            | Becomes                                         |
| ---------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `entries.create` | `{ type, title?, slug?, locale?, localeGroup?, fields?, status?, publishedAt? }` | `{ type, data: EntryCreateData }`               |
| `users.create`   | `{ email, name, fields?, roleSlug? }`                                            | `{ data: { email, name, fields?, roleSlug? } }` |

`EntryCreateData` is its own type in `packages/astromech/src/types/services.ts`:
the update patch plus `locale` and `localeGroup`, which are write-once columns a
patch cannot carry. They go inside `data`, following `duplicate`'s `overrides`,
the one existing bucket that holds them; a third top-level slot beside `type`
would be a pattern nothing else uses.

Every other mutating method already conforms (`entries.update`, `users.update`,
`media.update`, `forms.submit`) or carries no record (`trash`, `restore`,
`publish`, `media.upload({ file })`, …).

**The wire does not change.** `POST /entries/:type` and `POST /users` keep a
flat body. The route-table entries in
`packages/astromech/src/transport/http/routes/http-routes.shared.ts` gain
`bodyKey: 'data'`, exactly as `entries.update` has, so the generated client
sends `params.data` as the body and the OpenAPI document describes the body
from it. The manifest contracts (`packages/astromech/src/entries/methods.ts`,
`packages/astromech/src/users/contract.ts`) take the `update` form,
`z.object({ type, data: createEntrySchema(...) })`, which is what the CLI and
MCP projections already handle for `update`.

## Rule 2 — verb plus noun; the noun carries plurality

A function that acts on one row names the singular; one that takes `ids` or
returns a list names the plural. `media` is uncountable and reads the same both
ways.

| Domain    | Today                                                      | Becomes                                                                                  |
| --------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `entries` | `create`, `get`, `query`, `duplicate`                      | `createEntry`, `getEntry`, `queryEntries`, `duplicateEntry`                              |
| `entries` | `createStaged`, `getStaged`, `mergeStaged`, `deleteStaged` | `createStagedEntry`, `getStagedEntry`, `mergeStagedEntry`, `deleteStagedEntry`           |
| `entries` | `listVersions`, `restoreVersion`                           | `listEntryVersions`, `restoreEntryVersion`                                               |
| `entries` | `incomingRelationships`                                    | `listIncomingRelationships`                                                              |
| `users`   | `create`, `get`, `query`, `update`                         | `createUser`, `getUser`, `queryUsers`, `updateUser` (`deleteUser` already fits)          |
| `media`   | `get`, `query`, `update`, `upload`, `replace`, `usedBy`    | `getMedia`, `queryMedia`, `updateMedia`, `uploadMedia`, `replaceMedia`, `listMediaUsage` |

Already conforming: `updateEntries`, `deleteEntries`, `trashEntries`,
`restoreEntries`, `publishEntries`, `unpublishEntries`, `scheduleEntries`,
`emptyTrash`, `issuePreviewToken`, `revokePreviewToken`, `deleteUser`,
`deleteMedia`. `runPreviewGet` and `runPreviewQuery` in
`packages/astromech/src/entries/operations/preview/read.ts` are internal to the
preview path and are left alone.

Two names are judgement calls and are recorded here so they are not relitigated:
`listIncomingRelationships` (it returns a list; `get` would suggest one row) and
`listMediaUsage` (the service method stays `usedBy`; the operation names what
it returns).

File names under `operations/` do not change; the directory already carries
the noun.

## The work

Four commits on `main`, one per stage. Stages 1 to 3 were written by a `coder`
sub-agent and gated by the main thread; stage 4 is documentation and was written
by the main thread. The service tests under `packages/astromech/tests/services/`
and the route tests under `packages/astromech/tests/transport/http/` are the
safety net; nothing here changes behaviour, with the one RPC field-path
exception recorded under stage 2.

**Stage 1 — `entries.create` takes `data`**

- [x] `types/services.ts`: add `EntryCreateData`; `EntryCreateParams` becomes
      `{ type: string; data: EntryCreateData }`. `types/typed-entries.ts` carries
      its own pair of `create` overloads and moves with it; the wide overload
      keeps `fields?: Record<string, unknown>`, because `EntryCreateData`'s
      `JsonObject` rejects what the forms plugin writes.
- [x] `entries/schema.ts` / `entries/methods.ts`: the `create` contract becomes
      `z.object({ type, data: createEntrySchema({ titled }) })`.
- [x] `operations/create.ts` reads `params.data`. The `isPublicBranded` guard
      reads `params.data.fields`.
- [x] `http-routes.shared.ts`: `bodyKey: 'data'` on `entries.create`; the bespoke
      handler in `routes/entries.ts` passes `{ type, data: parsed.data }`.
- [x] Callers: `transport/cli/commands/entries-create.ts`,
      `admin/components/entries/entry-new-page.tsx` (two calls),
      `admin/hooks/entries.ts` (`useCreateEntry`, which nothing calls; delete it
      rather than migrate it), `packages/plugins/forms/src/service/forms.ts`,
      `packages/plugins/redirects/src/hooks/slug-change.ts`, and the example in
      `packages/plugins/redirects/README.md`.
- [x] Tests: 254 `entries.create` calls across 38 files, not the fifteen the
      inventory counted; most tests alias the service (`entriesService as api`),
      which a naive grep misses. The wire assertion in
      `tests/transport/http/client/methods.test.ts` keeps `body: { title: 'One' }`
      because the wire is unchanged. `openapi-document.test.ts` follows a `$ref`:
      the body now emits as the registered `CreateEntry` component rather than an
      inlined clone, with identical properties.

**Stage 2 — `users.create` takes `data`**

- [x] `types/services.ts` (`UserCreateData`), `users/contract.ts`,
      `users/operations/create.ts`, `http-routes.shared.ts` (`bodyKey: 'data'`),
      `routes/users.ts`, `admin/hooks/users.ts`.
- [x] Tests: thirty-six calls across twelve files, mechanical but for the RPC
      field path below.

One behaviour change, on the RPC transport only. `POST /rpc/:id` passes the
whole body to the contract schema and calls `fromZodError` with no `bodyKey`
(`packages/astromech/src/transport/http/routes/rpc.ts:41`), so a rejected
`create` field is now named `data.email` rather than `email`, as `update`'s
already was. The REST routes are unaffected: they declare `bodyKey: 'data'`,
which rebases the path back to the flat body the caller sent.

**Stage 3 — verb-noun names**

- [x] Rename per the table, `entries` then `users` then `media`, updating each
      domain's `service.ts` import. The service object keys do not change, so
      the three service objects stop using shorthand and read `key: newName`.
- [x] `grep -rn "operations/" packages/astromech/src --include='*.ts'` for any
      importer outside `service.ts`; there was none besides the entries
      status wrappers importing `updateEntries` and four sibling imports within
      `users/operations/` and `media/operations/`. No test file changed, which
      is the check that this was a rename and nothing else.

**Stage 4 — close out**

- [x] `TERMINOLOGY.md` gets no entry (these are conventions, not terms). The
      `code` skill states neither rule, so it gains an "Operation signatures"
      section; its "a function name says what it does" example was `createStaged`,
      now `createStagedEntry`.
- [x] A decision record for the two rules, naming `overrides` and `value` as
      the deliberate exceptions and why, and recording that a nested `data`
      moves the RPC transport's validation field paths under `data.` while
      leaving REST's alone. `DECISIONS.md`.

## Not changing

- The REST bodies, routes and verbs; `rest-bulk-route-shape.md` owns those.
- `duplicate`'s `overrides` and `settings.set`'s `value`.
- The public service method names.
- `flatten-user-and-media-operations.md` is separate work on the same files;
  whichever runs second rebases on the first.
