# `col.reference` resolution

A resolver that loads the record a `col.reference` column points at. It is
deferred: no reader needs one yet. This file records what the columns are, the
one consumer that shipped without it, what would make it worth building, and a
design to start from.

## The columns

There are 34 `col.reference` columns, 32 in core and 2 in the assistant plugin
(`grep -rn "col.reference(" packages/astromech/src packages/plugins/*/src`).
By role:

| Role               | Count | Columns                                                                                                                                             | Needs resolution?                              |
| ------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Author stamps      | 19    | `createdBy` and `updatedBy` on the entries, globals, media and settings tables, and on each domain's content and version tables; all target `users` | Possibly: a reader may want a name, not an id  |
| Owner foreign keys | 8     | `entryId`, `globalId`, `mediaId` and `userId` on each content table, and `contentId` on each version table                                          | No: the content repositories already join them |
| `stagedFor`        | 2     | The entry and global content tables' reference from a staged row to its canonical row                                                               | No: used only as a filter                      |
| Owned by a user    | 5     | `userId` on the two auth tables, on notifications, and on the assistant plugin's sessions and approvals                                             | No: only ever filtered by the acting user      |

Only the author stamps could want a resolver.

## The shipped consumer

The first consumer this file expected, "created by" on the entry list, shipped
client-side in commit d7fab970. `useAuthorNames`
(`packages/admin/src/hooks/author-names.ts`) fetches every user once and maps
each author id to a name. Its cost is tracked in `roadmap/backlog.md`.

## Constraints

- **Do not call it `populate`.** A "populated record" is the shape
  `relationship` and `media` validation rejects: the phrase is in the validation
  message in `packages/astromech/src/fields/built-in-rules.ts`, and the naming
  rule (`resolveRefs`/`withRefs`, never `populate`) is in `DECISIONS.md`. Using
  the word for a working feature would teach the opposite of what that error
  says.
- **Plugins can address core tables today.** A plugin's `ctx.db` is typed with
  the core tables, `createRepository` accepts any table, and the
  `astromech/database/schema` subpath exports every core table. Whether to close
  that off is a separate, larger decision.

## When to build it

Build a resolver when either of these is true:

- A plugin or a server-side read needs a referenced record's fields, not just
  its id.
- The fetch of every user in `useAuthorNames` becomes a measured cost.

## Design sketch

- `resolveRefs(table, rows, columns)` adds `row[column + 'Ref']` beside the raw
  id. It never replaces the id, so the rejected "populated record" shape never
  appears.
- `withRefs(repository, columns)` wraps a repository so its reads call
  `resolveRefs`. It is opt-in and resolves one level deep.
- A resolver registry is keyed by the reference target string (`'users'`). Each
  domain registers a loader that returns a named projection (users →
  `{ id, name }`) and checks the reader's permission.
- Loaders read with batched `IN` queries of at most 100 ids, because D1 caps a
  query at 100 bound parameters.
- A plugin gets `ctx.refs.resolve(ownTable, rows, columns)`, which refuses a
  table the plugin does not own.
