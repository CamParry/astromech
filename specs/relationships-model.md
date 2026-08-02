# Relationships Model — derived index, field data as truth

**Status:** LOCKED by grilling 2026-08-03. This file is the build design and is **deleted once the
work ships**. Status tracking: `roadmap/in-progress/relationships-model.md`. Rationale and the roads
not taken are recorded permanently in `decisions/0004-relationships-as-a-derived-index.md` — this
file states _what_ is being built and repeats a reason only where it changes how to build it.

## 0. The one-sentence model

**Field data is the single source of truth. The `relationships` table is a derived, rebuildable
index**, consulted for exactly three things — reverse lookup, filter-by-relation, and delete-time
information — and never for a forward read.

Everything below follows from that, plus one consequence people miss: a wrong index is repairable,
whereas wrong truth is data loss. That is what makes it safe for the index to be polymorphic, which
every prior-art horror story (Strapi morphs, Directus M2A) gets wrong by making the polymorphic
table authoritative.

## 1. What exists today, and why it is being replaced

Not "improved" — the current subsystem is decorative. Verified against `main` at 4812bda:

- `inverse`, `ordered` and `onDelete` are declared on the relationship field
  (`types/fields.ts:330`, `fields/builder.ts:43-49`) and **read by nothing**.
- `flattenEntryFields` (`fields/helpers.ts:38-71`) treats `group`/`repeater`/`blocks`/`tree` as
  opaque leaves, so a relationship nested in any container gets **no rows at all**. Meanwhile
  `kernel/config-resolver.ts:194-209` **does** recurse for target validation — the two walks
  disagree, so a nested relationship validates at boot and then silently indexes nothing.
- `saveRelationships` skips falsy values (`entries/internal/relationships.ts:30`), so **clearing a
  single relation leaves the old rows in place**. `[]` is truthy, so clearing a multi-relation works.
  The two cases diverge.
- `targetType` is `field.target === 'users' ? 'user' : 'entry'` (`relationships.ts:33`), so a
  relationship targeting **media is recorded as an entry**, then looked up in the entries table and
  dropped. Combined with `saveRelationships` ignoring `media`-type fields entirely, **no
  `targetKind: 'media'` row is ever written by any code path.**
- `trash-purge` (`entries/jobs/trash-purge.ts:5`) claims "cascade deletes handle relationships"; that
  table has no FKs, so purged entries leave orphan rows.
- `incomingRelations` (`entries/operations/relations.ts:19`) loads each source through the
  **target's** storage — correct only because built-in types share one storage singleton, and wrong
  the moment a table-backed type is a target. It is also N+1.
- `media.delete` (`media/service.ts:219-233`) checks nothing and unconditionally drops rows nothing
  ever wrote. There is no "where is this used" for media anywhere.
- `updateOne` runs in **no transaction at all** on the single-entry path (`update.ts:232` passes
  `undefined`); only bulk is transactional. So entry-write and index-write are already non-atomic on
  libSQL, not merely on D1.

## 2. Path addressing — reuse the shipped grammar

`fields/field-path.ts` already defines the grammar, and its own docstring anticipates this work
("a future relationships index will key on the schema-path form"). Nothing new is invented.

One `FieldPathSegment[]` renders two ways:

|                   | Function           | Example                          |
| ----------------- | ------------------ | -------------------------------- |
| **schema path**   | `formatSchemaPath` | `sections[].items[].gallery`     |
| **instance path** | `formatFieldPath`  | `sections[a1].items[b2].gallery` |

- **Items are addressed by persisted `_id`, never by array index.** An index shifts between form load
  and save; `_id` does not. This is Sanity's `_key` model, adopted for the same reason they adopted
  it — a concurrent reorder made index-addressed patches rename the wrong item.
- **`_children` is never a segment.** Tree item ids are unique across the whole tree, so a node at
  any depth addresses as `nav[<id>].label`; depth never appears.
- **Ordering never appears in a path**, because ordering lives only in array position in field data.

### Why both are stored

The schema path is what queries match on — an equality test against an indexed column. Matching an
instance path would require a `GLOB` with a mid-string wildcard, which cannot use an index and
degrades further with each level of nesting (`sections[*].items[*].link`). The instance path is
stored for deep-linking and granular repair and is **never pattern-matched**.

Both render from the same segment array in the same pass, so they cannot drift.

## 3. Row shape — LOCKED

```
sourceId      TEXT  NOT NULL   the entry/user/media holding the reference
sourceKind    ENUM  NOT NULL   entry | user | media
sourceType    TEXT  NULL       the entry type ('post', 'ns/type'); NULL for user/media sources
schemaPath    TEXT  NOT NULL   'sections[].gallery'
instancePath  TEXT  NOT NULL   'sections[a1].gallery'
targetId      TEXT  NOT NULL
targetKind    ENUM  NOT NULL   entry | user | media
sourceStaged  BOOL  NOT NULL   derived from the source row's stagedFor
```

**PRIMARY KEY** `(sourceId, sourceKind, instancePath, targetId, targetKind)` — composite. A
multi-relation `gallery: [m1, m2]` shares an instancePath and differs only by target. All five are
NOT NULL, which matters: SQLite's rowid tables historically permit NULLs in PK columns, so a
nullable PK column would silently defeat the uniqueness it appears to declare. `sourceType` is
nullable and deliberately outside the key.

**Indexes:** `(targetId, targetKind)` for reverse lookup; `(sourceType, schemaPath, targetId)` for
filter-by-relation.

### Deletions from today's shape, each with its reason

- **`name` → replaced by `schemaPath`.** `name` is precisely the thing that cannot address a nested
  field.
- **`position` deleted.** Written today as the array index (`relationships.ts:160`). It is the
  double-source-of-truth bug this design exists to avoid — Strapi's `_ord`, Directus's `sort_field`.
  Order lives in field data; nothing may read it from here, so nothing stores it.
- **`createdAt` deleted.** On a derived row it does not mean "when the relation was made", it means
  "when this row was last rewritten" — a value that looks like provenance and is not.

### The one addition

**`sourceType`** (the entry type string, distinct from `sourceKind`). Without it every reverse
lookup and every filter-by-relation joins `entries` merely to ask "which of these are posts?", and
both the delete modal and the "used by" panel group by type. It is derived and rebuildable like the
rest of the row, so denormalising costs nothing that cannot be repaired.

**`sourceStaged`** exists so reverse lookup and filter-by-relation can exclude staged sources
cheaply, mirroring `buildListWhere`'s unconditional `stagedFor IS NULL` (`built-in.ts:100`), while
delete-time information **includes** them — otherwise you delete a target a pending merge depends on
and discover it at merge time.

## 4. Maintenance — LOCKED

### The traversal

Reuse `descriptor.children()` (`types/fields.ts:283-286`), the same descriptor-driven recursion the
validation pipeline uses (`fields/pipeline.ts:264-283`). It is implemented by `group`, `repeater`,
`blocks` and `tree` in `fields/core-descriptors.ts`, and it yields `ContainerScope`s carrying
segments relative to their container — exactly what the path grammar consumes.

> **TRAP — the single most important implementation constraint in this document.**
> `children()` **mints `_id`s with `crypto.randomUUID()` when one is missing**
> (`core-descriptors.ts:87-97`). It is therefore **non-deterministic on data that lacks ids**.
> The index traversal MUST run over the **post-`processFields`** data, whose ids have already been
> minted and written back, and MUST NEVER re-derive from raw input. A traversal over un-processed
> data mints fresh ids on every call, so the instance paths it produces match nothing in storage.
> Rebuild is safe for the same reason — stored data already carries ids.

### The write

**One `DELETE` for the whole source, then one chunked `INSERT`.** Not a per-field `replaceAll`, and
not a set-diff.

The reason is a specific documented failure mode: Payload's stale-relationship bug (#15976) is an
**absent-branch** bug — a null check that read `=== null` and missed `undefined`, so rows were never
added to the delete set. Deleting the source's entire edge set has no absent branch to get wrong.
A set-diff would reduce write volume and reintroduce exactly that class of bug; the index is small
and rebuildable, so the trade is not worth taking.

Chunk the insert: **D1 caps a query at 100 bound parameters.**

### Where it runs

At the same seam as today's `saveRelationships` — but for **entries, users and media**, all three of
which run `processFields` and all three of which can hold relationship fields. Indexing only entries
would recreate the silent-gap bug this work exists to fix. Settings are excluded: keyed by `key`,
not a targetable resource.

### Atomicity

It cannot be atomic. D1 has no interactive transactions (`drivers/d1.ts:79`), so `storage.transaction`
is simply absent and every caller falls through to a sequential branch; and `updateOne` opens no
transaction even on libSQL. **This is acceptable only because the index is derived** — a torn write
is repaired by rebuild, never by restoring data. Rebuildability is load-bearing here, not a
convenience.

## 5. Query API — LOCKED

One predicate:

```ts
entries.query({ type: 'post', where: { references: { path: 'author', id: authorId } } });
```

- Compiles to an `EXISTS` against the index. Excludes staged sources by default.
- **`path` is validated against the resolved schema at query time and throws if it does not exist.**
  A typo'd path must not degrade to "no results" — that is the same silent-failure class as the
  current `where` allow-list, which drops unknown keys and returns unfiltered rows with a confident
  total (`built-in.ts:124-148`).
- **ID-only.** `posts where author.name = 'X'` is NOT supported and must throw with guidance to
  resolve first, then filter by id. Strapi's own docs warn deep filters cause performance problems
  and advise hand-writing a route; Payload's multi-hop dot notation is buggy (#2150). This is where
  every prior-art query layer becomes baroque.

`incomingRelations` is rebuilt on this predicate, which removes its N+1 and its wrong-storage bug.

## 6. Deletes — LOCKED

**No `onDelete` mechanism at all. The option is deleted, not implemented.**

- Deletes are **never blocked** and **never cascade**.
- The dangling id **stays in field data** until that entry is next written, at which point the write
  pipeline drops it. Opportunistic cleanup — no mass write, no version churn per referencing entry,
  no collision with a staged copy.
- Reads return the raw id. A consumer that fetches it gets nothing.

`cascade` and `set-null` were rejected because a relationship value lives inside the `fields` JSON
blob where no database mechanism can reach it. Both would require an app-layer sweep rewriting every
referencing entry — cutting a version each, bumping every `updatedAt`, and colliding with staged
copies. `restrict` was rejected as a product decision: a CMS should not refuse to delete.

The delete modal keeps its incoming-references list as **information**, which is all it has ever
actually been (`DeleteEntryModal.tsx:52,119-151` renders the list and never disables the button).
Media gains the same panel, which it cannot have today because no media rows are ever written.

## 7. Deliberately not built

- **`populate` is deleted** (`internal/populate.ts`, `storage/related-records.ts`, the `populate`
  param). No replacement helper is needed — `where: { id: { in: [...] } }` is already supported
  (`built-in.ts:124-148`).

    Beyond the N+1 and the varying read shape, this removes a **security** risk rather than a
    performance one: the roadmap's rule that "populate must re-apply the same visibility predicates as
    a direct read" is what produced a Keystone security advisory and Payload discussion #3963. Nothing
    traverses relations on read, so there is nothing to leak through.

- **The declared reverse field is deferred.** Reverse lookup needs no declaration — it is an indexed
  read, and the query predicate above covers the delete modal, media "used by" and
  filter-by-relation. A declared virtual field would be sugar compiling to that same query, and it
  can be added later without touching storage. If it comes back, it is keyed on the **forward field
  path** and never on a relation name: Payload, Keystone and Directus all key on path and cannot
  desync, Prisma needs invented names only because it keys on the type pair, and Strapi requires two
  independently-written names — which produced duplicate join tables and silent relation-data loss
  (#14428, #15037).

- **`entry_versions.relations` is dropped** (`entries/schema.ts:70`). It stores ids-keyed-by-name
  with no path and no target kind — a redundant second copy of information the version's own field
  data already holds. `versions/restore.ts:49-69` re-derives from field data instead, and update's
  change-detection compares field data.

- **Staging stops copying rows.** `staging/create.ts:35-46` copies every canonical row to the staged
  id and `staging/merge.ts:97-115` performs a delete-and-recreate dance. Both are deleted: a staged
  entry is a real row with its own field data, so its edges derive like any other row's.

- **`inverse`, `ordered` and `onDelete`** are removed from the field API. All three are declared and
  read by nothing; removing them regresses no behaviour.

## 8. Rebuild and drift — LOCKED

- **`astromech index:rebuild [--type <t>]`** — recompute from field data, replace.
- **`--check`** — recompute and diff without writing; non-zero exit on drift. This is the parity test,
  runnable in the gate.
- **The index is a function of `(schema, data)`**, so a config change invalidates it exactly as a data
  change does. Adding a relationship field to a container means the existing rows are now incomplete.
- **No automatic startup repair.** Expensive, surprising, and it hides the drift it is papering over.

Payload is the closest prior art for a derived relationship index and has **no rebuild command** —
and a matching set of drift bugs (#15976, #13736, #14157, #6037). Contentful's equivalent is an
external offline tool (`contentful-link-cleaner`). Shipping the repair path with the index, rather
than after the first drift report, is the lesson.

## 9. Workstreams

One branch, a commit per workstream.

- **WS0 — composite PK in `schema-engine`.** Optional `primaryKey?: string[]` on `SnapshotTable`
  (`model.ts:50-55`) so existing snapshots parse unchanged and **no rebaseline is needed**;
  `PRIMARY KEY (…)` line in `renderCreateTable` (`ddl.ts:78-86`); `renderColumnClause` skips the
  inline `PRIMARY KEY` when a table-level one exists; PK equality check in `diffTable`;
  `resolveReferenceTarget` (`descriptor-snapshot.ts:84-96`) throws a clear error for a composite-PK
  target. The rebuild path needs nothing — a PK change already forces a rebuild (`diff.ts:86`) and
  the rebuild re-renders from the snapshot.
- **WS1 — the index.** New table shape; the shared traversal across entries/users/media; delete
  `saveRelationships`/`replaceAll`; staging stops copying; drop `entry_versions.relations`.
- **WS2 — the query.** The `references` predicate with query-time path validation; rebuild
  `incomingRelations` on it; delete modal and media "used by".
- **WS3 — repair.** `index:rebuild` + `--check` + the parity test.
- **WS4 — cleanup.** Remove `inverse`/`ordered`/`onDelete`; opportunistic dangling cleanup on write;
  fix the `trash-purge` orphan and its wrong comment.

**Migration is drop-and-rebuild.** The index is derived, so there is no data migration: the generated
migration reshapes the table and `index:rebuild` repopulates from field data.

## 10. Deliberately out of scope

- **Scalar field filtering/sorting** → `roadmap/planned/field-value-query-indexing.md`. Shares the
  motivation, not the mechanism (generated columns, no derived table, no traversal).
- **Pushing visibility predicates into SQL.** Real and pre-existing — filtering runs post-fetch in JS
  so `total`/`pages` are already wrong for scheduled content (`query.ts:41-45` documents it). Not
  made structurally worse by this work. Tracked in `field-value-query-indexing.md`.
- **`WITHOUT ROWID` on the index table.** A composite PK on a rowid table is implemented as a unique
  index plus a hidden rowid, so the storage win only arrives with `WITHOUT ROWID`. Our row sits right
  at SQLite's recommended size boundary (~200 bytes) once `instancePath` carries nested ids, and it
  is a pure storage decision that can be taken later without touching the logical schema.
- **Profile-as-entry, row-level permissions, one-user-one-profile.** A separate feature that this one
  unblocks rather than contains.
- **Symmetric relations**, **hierarchy machinery**, and **taxonomy tables** — all settled as "build
  nothing" in `decisions/0004`, not restated here.

## 11. Traps to heed while building

- `children()` mints ids — see §4. This is the one that will silently produce a wrong index.
- Chunk inserts at **100 bound parameters** for D1.
- `updateOne` has no transaction; do not assume the index write is protected by one.
- The unique index on `entries` is partial (`WHERE staged_for IS NULL`) — staged rows are real rows
  and will appear in any traversal that does not filter them.
- `sourceType` for a plugin entry type is the **qualified** `<ns>/<type>` string.
- Test-harness DBs must be temp **files**, not `:memory:` — a libSQL transaction blanks a `:memory:`
  base connection.
