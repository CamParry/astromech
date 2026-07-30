# Relationships Model

Rethink of how content relationships are stored, read and reverse-queried. Supersedes the
"three-way storage split / polymorphic relationships table" sketch parked in `specs/data-layer.md` §8,
and absorbs `populate-and-complex-field-data-model.md` entirely (that file is deleted — its open
items are all covered here, its settled decisions are recorded below).

**Status:** direction agreed in discussion (2026-07-27), NOT locked. No implementation started.
Needs a grilling pass before it becomes a spec.

Filtering/sorting entries by their own scalar field values (the `meta_query` equivalent) was
considered alongside this and **split out** to `planned/field-value-query-indexing.md` (2026-07-30):
it shares the motivation but not the mechanism — generated columns, no derived table, no traversal.

## The problem with what exists

The same fact is stored twice and nothing reconciles the two:

1. IDs in the entry's `fields` JSON — what the form posts, what versions snapshot.
2. Rows in the polymorphic `relationships` table — written by `saveRelationships` as a blunt
   `replaceAll` per field on create/update.

The table is silently derived from the JSON but is treated as if it were storage. Consequences:

- `inverse`, `ordered` and `onDelete` are declared in `FieldDefinition` and read by **nothing**.
- Relationship fields nested in `group` / `repeater` / `blocks` get **no** rows at all
  (`flattenEntryFields` treats data containers as opaque leaves) — no populate, no incoming
  relations, no delete warning.
- `populate` is N+1 (one relationships query per entry per field) and single-type only.
- Dangling IDs are silently `.filter(Boolean)`-ed away.
- Populated values _replace_ the ID in `fields`, so the read shape varies by call.

## Already settled (carried over from `populate-and-complex-field-data-model.md`)

- Repeater / block items are stored as **arrays of objects, each carrying a persisted `_id` UUID** —
  not UUID-keyed objects.
- **Drag-reorder preserves item identity**: reordering keeps the persisted `_id` (no key
  regeneration), and ordering is array position, never a separate `_order` field. This is the same
  principle the index must honour — order lives in the field data, nowhere else.

## Agreed direction

**Field data is the single source of truth. The `relationships` table becomes a derived,
rebuildable index — never consulted for a forward read.**

- IDs **and their order** always live in the entry's field data. No exceptions: author, category,
  single media, gallery. Array position _is_ the ordering; the index is never allowed to own it
  (this is the double-source-of-truth bug that bites Strapi's `_ord` and Directus's `sort_field`).
- The index is maintained by **one deep traversal** of the field data on write — which is what makes
  nested (repeater / block / group) relations work at all.
- The index is **rebuildable from field data**, which is what makes it safe for it to be polymorphic.
  Every polymorphic-relation horror story in the prior art (Strapi morphs, Directus M2A) comes from a
  polymorphic table being _authoritative_; a wrong index is repairable, wrong truth is data loss.
- Index rows are keyed by _(source type, source id, **field path**, target type, target id)_ —
  a **path**, not a name, so nested fields (`sections.gallery`) are addressable.
- The index powers exactly three things: reverse lookup ("used by"), filter-by-relation, and
  delete-time integrity. Nothing else reads it.
- Forward `populate` reads IDs straight out of the row already fetched, then batches
  `WHERE id IN (...)` per target type — no index query, no N+1, media included in the same pass.

### Reverse side

- The reverse **query** needs no declaration — it is just an indexed read.
- A declared reverse is a **virtual field** (Payload's `join`): stores nothing, names the forward
  edge, exists only for admin UI, SDK types, and config-time validation that the forward field
  exists and points where claimed. One real side, so nothing can drift.
- Two-way relations (post↔category) are one edge read in two directions — never a second stored side.

### Hard rules taken from the prior art

- **No depth parameter.** Explicit per-field opt-in, one level. Want the next hop, ask for it.
  (`populate=*` measured at ~20s vs 20-30ms in Strapi; Contentful caps `include` at 10 and people
  still hit it; Storyblok degrades silently past 50; Payload is proposing dropping its default from
  2 to 1.)
- **Populate must re-apply the same visibility predicates as a direct read.** Both Payload
  (discussion #3963) and Keystone (#7710 + a Keystone-5 security advisory) leak content through
  relation traversal. We have a public/full axis _and_ staging to leak through.
- **Per-relation delete behaviour must be real**, not the dead `onDelete` option we have today.
  `restrict` can be enforced at the app layer from the incoming list the delete modal already shows.
- IDs, never slugs (Keystatic documents that renaming silently breaks references).

### Taxonomies

Categories and tags stay **entry types**. Build no taxonomy table and no taxonomy plugin.

WordPress needed a bespoke `term_relationships` table because postmeta could not be reverse-queried
or filtered; the index gives that to _every_ field, so the historical justification is gone. A
separate taxonomy model would duplicate admin UI, permissions, localisation and versioning for
"an entry with a name and a slug". A plugin-owned table is worse still — it would not participate in
the index unless the index is made extensible to plugin tables.

### Hierarchy and self-reference

Neither needs new machinery:

- Hierarchical categories are self-referential **one**-to-many — a single parent ID in the child's
  field data (structurally identical to the existing `parent: relationship('page')`). A DAG is an
  array of parent IDs. "Children of X" is a reverse read.
- Genuine self-M2M ("related posts") is an array of IDs on one side, N edges in the index.
- The index is **directed** — A listing B does not make B list A. Reading it undirected is a query
  flag, not a storage decision.
- "All descendants" is the one tree query the index does not give cheaply: N hops or
  `WITH RECURSIVE`. A query concern, not a storage one.

### Symmetric relations

Parked — not a blocker. True symmetry is not storable under a single-source-of-truth rule: someone
owns the ID. Mirror-on-write (Keystone's model) is rejected because editing A would create a new
_version_ of B, touch its timestamp, and collide with any staged copy of B. Preferred framing if it
comes back: symmetry is a **read** property — store directed, merge both directions on read, and
accept that the non-owning side sees it read-only.

### Users, profiles and `createdBy`

- Users stay **purely functional** (auth). Editorial data lives on a `profile` / `author` **entry**
  that relates to a user — so translation, versioning and permissions happen at the content layer.
- The link lives on the **profile** (`profile.user`), never on `users`: an admin may have no
  profile, a guest author may have no account, and `users` stays untouched in both directions.
  "The profile for this user" is a reverse read.
- This **decouples** the model from the better-auth table-ownership question — nothing needs to be
  added to `users` at all.
- `createdBy` (functional: which account wrote the row) and the **byline** (editorial: which profile
  gets credit) are different fields and must not be conflated. They are frequently different people.
- `createdBy` is a **record of who did it, not a claim of ownership**. Deleting a user must not force
  content reassignment the way WordPress does — `set-null` (or a retained display-name snapshot),
  never `restrict`.

## Open — revisit before speccing

- [ ] **Should `profile` be baked into core rather than left as a userland entry type?** It is a
      common enough need that a first-party profile may be worth it. Deliberately deferred.
- [ ] **Row-level permissions**: "a user may edit the profile entry that points at them, and no
      other" is ownership-scoped, a different shape from the role-based permissions we have. This is
      a new requirement the profile model creates, not a free win.
- [ ] **One-user-one-profile**: a uniqueness constraint the JSON cannot express. Leaning toward a
      write-time validation that _reads_ the index, so the index stays purely derived — not a DB
      constraint _on_ the index. Do not overcomplicate.
- [ ] **What maintains the index on write** — a deep traversal at the storage seam vs. something the
      entries service does. This is where drift risk lives. Not yet discussed.
- [ ] **Rebuild path** — CLI command and/or startup repair, and what makes drift detectable.
- [ ] **Table-backed entries**: field data is columns, not a JSON blob. The rule holds ("IDs live in
      field data, index is derived"); only the traversal source differs. Confirm.
- [ ] **Filter-by-relation scope.** Support `posts where category = <id>` (indexed read of the edge).
      Do **not** support `posts where author.name = 'X'` — that needs a real join into the target's
      own fields and is where Payload's and Strapi's query layers get baroque. Resolve first, then
      query by ID.
- [ ] Whether `populate` survives at all, or whether the WordPress model (here's your object, go
      fetch what you need) is enough.
- [ ] Broken-reference signalling — Contentful's `errors[]` / Prismic's `isBroken` rather than the
      silent `.filter(Boolean)` we do today.
- [ ] **Media in the same traversal** — media IDs in field data (including inside repeater rows,
      block items and group fields) get indexed and resolved by the same single pass, so media gains
      "used by" and delete-protection without being a relationship field. Replaces the old separate
      "media populate" workstream.
- [ ] Naming: the table stays `relationships` (renaming it `references` would collide with
      `col.reference`, which means a real FK).
- [ ] Migration/backfill for existing stored data.

## Separate workstream (noted, not part of this)

Own the `users` table ourselves instead of better-auth owning it — a descriptor generating it into
our normal migration chain, with better-auth reading and writing it. Removes the hand-authored
"foreign tables" carve-out from the migration baseline; the cost is that tracking better-auth's
expected schema across versions becomes our job. Not urgent — the profile model removes the reason
it was blocking.
