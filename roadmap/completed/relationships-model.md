# Relationships Model

Rethink of how content relationships are stored, read and reverse-queried. Absorbs
`populate-and-complex-field-data-model.md` entirely (that file is deleted — its settled decisions
are recorded below).

**Status:** SHIPPED 2026-08-03. All five workstreams merged to main from
`feat/relationships-model`; the build spec is deleted and the permanent rationale lives in
`decisions/0004-relationships-as-a-derived-index.md`.

Filtering/sorting entries by their own scalar field values (the `meta_query` equivalent) was
considered alongside this and **split out** to `planned/field-value-query-indexing.md`: it shares
the motivation but not the mechanism — generated columns, no derived table, no traversal.

## The model

**Field data is the single source of truth. The `relationships` table is a derived, rebuildable
index**, read for exactly three things — reverse lookup, filter-by-relation, and delete-time
information — and never for a forward read. A wrong index is repairable; wrong truth is data loss,
which is what makes it safe for the index to be polymorphic.

Row is keyed on a **composite PK** over `(sourceId, sourceKind, instancePath, targetId, targetKind)`,
carrying both a **schema path** (`sections[].gallery`, indexed, what queries match) and an
**instance path** (`sections[a1].gallery`, stored, never pattern-matched). Items are addressed by
persisted `_id`, never by array index. `name`, `position` and `createdAt` are deleted.

## Workstreams

One branch, a commit per workstream. Details and rationale in the spec.

- [x] **WS0 — composite PK in `schema-engine`.** Optional `primaryKey?: string[]` on `SnapshotTable`
      (existing snapshots parse unchanged; no rebaseline), `PRIMARY KEY (…)` in `renderCreateTable`,
      PK equality check in `diffTable`, `resolveReferenceTarget` guard. Also rejects an empty key, a
      key naming an unknown column, and a **nullable** key column — SQLite's rowid tables permit
      NULLs in a PRIMARY KEY, which would silently defeat the uniqueness.
- [x] **WS1 — the index.** New table shape; one traversal over post-`processFields` data across
      entries/users/media; delete `saveRelationships`/`replaceAll`; staging stops copying rows;
      drop `entry_versions.relations`. Absorbed two items §9 left unscheduled: **`populate` is
      deleted** (it read the index by `name`, so WS1 forced the issue) and the seeds move their
      relation ids into field data. The schema oracle now normalizes identifier quoting — `ALTER
TABLE … RENAME TO` re-quotes the stored DDL, so every rebuilt table would otherwise sit
      permanently out of parity with a freshly emitted one.
- [x] **WS2 — the query.** `where: { references: { path, id } }` compiling to an `EXISTS`, with
      query-time path validation against `collectRelationshipSchemaPaths` — which derives the
      allow-list from definitions alone by driving `descriptor.children()` with a **probe value**, so
      a plugin container recurses for free (`blocks` needs one probe item per declared block type or
      it yields no scope). A `tableStorage`-backed type refuses the filter rather than returning every
      row. `incomingRelations` had a real bug: it loaded every source through the **target's** type
      storage, so a source of any other entry type vanished silently; sources are now grouped by
      `sourceType` and loaded through their own. `IncomingRelation.name` → `schemaPath`.
- [x] **WS3 — repair.** `astromech index:rebuild [--type] [--check]` + the parity test. Each domain
      collects its own sources; the kernel composes them. Two traps found: `loadConfig` does **not**
      register the plugin runtime, so without doing so a table-backed plugin type reads as zero
      sources and a rebuild **deletes every edge it has**; and an unscoped rebuild deletes rows for
      any source it did not enumerate, which is correct by definition but unguarded for a
      programmatic caller.
- [x] **WS4 — cleanup.** `inverse`/`ordered`/`onDelete` removed; `trash-purge` clears the index for
      the ids it purged (it was the only hard-delete path missing it); dangling ids dropped on write.
      The existence check is deliberately timid — a false negative deletes author data — so an id is
      KEPT when the field names no target, when the target names no configured entry type, and when
      the target type is `tableStorage`-backed (its rows are not in `entries`, so a check there
      reports every one absent). Consequence: table-backed targets accumulate dangling ids until
      `index:rebuild`.

Also done alongside: **`domain-no-peer-imports` was removed.** It was enforcing isolation the module
split never meant to buy, and it was producing a worse design — forbidding media from reading entries
did not remove the work of naming a source row, it moved it into the browser, giving "what references
this" two wire shapes. `domain-no-upward` still holds the shape that matters. The domains stay
outside `no-circular` for now because they have pre-existing internal cycles; worth bringing them in
once those are cleaned up, since a cycle is the entanglement actually worth catching.

Migration is drop-and-rebuild — the index is derived, so there is no data migration. It is
hand-authored (`apps/demo/migrations/ops/0003-relationships-index.ts`): the new NOT NULL columns
have no source in the old shape, so the differ correctly refuses to invent one.

Nothing repopulates the index after a config change — the index is a function of `(schema, data)`, so
adding a relationship field to a container leaves every existing row incomplete. `astromech
index:rebuild` is the repair path, and `--check` is runnable in the gate. There is deliberately no
automatic startup repair: it is expensive, surprising, and hides the drift it papers over.

Rationale and the roads not taken — no `populate`, no `onDelete`, no declared reverse field, no
filtering into a target's own fields, taxonomies as entry types, hierarchy, symmetric relations and
the profile model — are recorded permanently in
`decisions/0004-relationships-as-a-derived-index.md`. They are not repeated here.

## Carried-over storage facts

### Storage shape

- Repeater / block items are stored as **arrays of objects, each carrying a persisted `_id` UUID** —
  not UUID-keyed objects.
- **Drag-reorder preserves item identity**: reordering keeps the persisted `_id`, and ordering is
  array position, never a separate `_order` field. Order lives in field data, nowhere else — the
  index is never allowed to own it (the double-source-of-truth bug that bites Strapi's `_ord` and
  Directus's `sort_field`).
- IDs, never slugs (Keystatic documents that renaming silently breaks references).

## Split out of this work

Everything below has a home; nothing is tracked here, because a completed file is a bad place to
watch work that has not started.

- **Scalar field filtering/sorting** → `planned/field-value-query-indexing.md`.
- **Pushing visibility predicates into SQL** → the same file. Real and pre-existing
  (`query.ts:41-45` documents the wrong `total`), not made structurally worse by this work.
- **Profile as a first-party entry type**, and the **row-level permission** shape it needs →
  `planned/profile-entry-type.md`. A separate feature this one unblocks rather than contains.
- **Owning the `users` table** instead of better-auth owning it → `backlog.md`, storage-layer
  follow-ups. The profile model removes the reason it was blocking.
- **`WITHOUT ROWID`** on the index table, and **a declared reverse field** → `backlog.md`,
  relationships follow-ups.

The sharp edges found while building — table-backed targets never self-cleaning their dangling ids,
an unscoped rebuild deleting rows for sources it did not enumerate, and `--check` not being wired
into CI — are in `backlog.md` under the same heading.
