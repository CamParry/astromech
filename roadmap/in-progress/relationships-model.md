# Relationships Model

Rethink of how content relationships are stored, read and reverse-queried. Absorbs
`populate-and-complex-field-data-model.md` entirely (that file is deleted — its settled decisions
are recorded below).

**Status:** design LOCKED by grilling 2026-08-03. Full design of record:
`specs/relationships-model.md`. WS0 and WS1 built on `feat/relationships-model`.

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
- [ ] **WS2 — the query.** `where: { references: { path, id } }` with query-time path validation;
      rebuild `incomingRelations` on it; delete modal and media "used by".
- [ ] **WS3 — repair.** `astromech index:rebuild` + `--check` + the parity test.
- [ ] **WS4 — cleanup.** Remove `inverse`/`ordered`/`onDelete` from the field API; opportunistic
      dangling-id cleanup on write; fix the `trash-purge` orphan and its wrong comment.

Migration is drop-and-rebuild — the index is derived, so there is no data migration. It is
hand-authored (`apps/demo/migrations/ops/0003-relationships-index.ts`): the new NOT NULL columns
have no source in the old shape, so the differ correctly refuses to invent one.

Still deferred to WS3, and worth knowing before then: nothing repopulates the index after a config
change. `astromech index:rebuild` is the repair path, and until it lands the seeds derive their own
edges inline.

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

- **Scalar field filtering/sorting** → `planned/field-value-query-indexing.md`.
- **Profile as a first-party entry type**, and the **row-level permission** shape it needs ("a user
  may edit the profile entry that points at them, and no other") — a separate feature this one
  unblocks rather than contains. One-user-one-profile is a write-time validation that reads the
  index, never a DB constraint on it.
- **Pushing visibility predicates into SQL.** Real and pre-existing (`query.ts:41-45` documents the
  wrong `total`), not made structurally worse by this work.
- **`WITHOUT ROWID`** on the index table — a pure storage decision, takeable later.
- **Owning the `users` table** instead of better-auth owning it. The profile model removes the reason
  it was blocking.
