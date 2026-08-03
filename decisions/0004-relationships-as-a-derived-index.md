# 0004 — Relationships: a derived index, and what was not built

**Date:** 2026-08-03
**Status:** accepted

Supersedes the relationship sketch in `specs/data-layer.md` §8 (deleted in 0003),
which proposed an authoritative polymorphic table keyed on `instanceId` and
carrying `position`. The build spec is gone now that it has shipped; this file
holds only the _why_, and mostly the roads not taken.

## The table is derived, not storage

Field data is the single source of truth. The `relationships` table is an index
rebuildable from it, read for reverse lookup, filter-by-relation and delete-time
information, and never for a forward read.

This is what makes it safe for the index to be **polymorphic**. Every
polymorphic-relation horror story in the prior art — Strapi morphs, Directus M2A
— comes from a polymorphic table being _authoritative_. A wrong index is
repairable; wrong truth is data loss. The same property is what makes it
acceptable that the index write is **not atomic**: D1 has no interactive
transactions, and `updateOne` opens none even on libSQL, so a torn write is
always possible. Rebuildability is therefore load-bearing, not a convenience —
which is why the repair command ships _with_ the index rather than after the
first drift report. Payload is the closest prior art for a derived relationship
index, has no rebuild command, and has the matching drift bugs.

## Order lives in field data, and nowhere else

Array position _is_ the ordering. The index stores no `position` column, even
though the current one does.

An index that owns order is a second source of truth for a fact the JSON already
holds, and the two drift. This is the bug that bites Strapi's `_ord` and
Directus's `sort_field`. It also means a reorder — which changes no
relationship — must not rewrite index rows.

## Paths are keyed on `_id`, and stored twice

Items are addressed by their persisted `_id`, never by array index: an index
shifts between form load and save, so `blocks[2].title` can point at a different
item than the one it was built for. Sanity adopted `_key` for exactly this reason
after concurrent reorders made index-addressed patches rename the wrong item.

Both renderings of a path are stored — the **schema path**
(`sections[].gallery`) and the **instance path** (`sections[a1].gallery`) —
because they do different jobs. Queries match the schema path as an equality test
against an indexed column; matching instance paths would need a mid-string
wildcard, which cannot use an index and degrades with each level of nesting. The
instance path is stored for deep-linking and repair and is never pattern-matched.
Both render from one segment array in one pass, so they cannot drift.

Block type was considered as a path segment instead of `_id` and rejected: it
collides the moment a page has two heroes.

## Rejected: `populate`

Deleted rather than fixed. The N+1 and the read shape varying by call were the
visible problems; the deciding one was **security**. Resolving relations on read
means re-applying the same visibility predicates as a direct read, and both
Payload (discussion #3963) and Keystone (#7710, plus a Keystone-5 security
advisory) have leaked content through relation traversal. We have a public/full
axis _and_ staging to leak through. Nothing traverses relations on read, so
there is nothing to leak.

Two alternatives were live. Replacing the id in place and typing it as a union
(`string | Author`) is what Payload and Strapi do, but it cannot name what it
populates once relations nest, and it makes every relation field a union in
generated types. Populating into a sidecar keyed by instance path fixes both but
adds a shape nobody else has. Neither earned its cost against
`where: { id: { in: [...] } }`, which already exists.

Depth was never on the table: `populate=*` measures ~20s against 20–30ms in
Strapi, Contentful caps `include` at 10 and people still hit it, and Payload has
proposed dropping its default from 2 to 1.

## Rejected: any `onDelete` mechanism

Deletes are never blocked and never cascade. A dangling id stays in field data
until that entry is next written, then the write pipeline drops it.

`cascade` and `set-null` are not implementable honestly, because a relationship
value lives inside the `fields` JSON blob where no database mechanism reaches it.
Both would mean an app-layer sweep rewriting every referencing entry — a version
cut each, every `updatedAt` bumped, and a collision with any staged copy. This is
the same mass-write objection that killed mirror-on-write for symmetric
relations.

`restrict` is implementable and was still rejected: a CMS should not refuse to
delete. The delete modal's incoming-references list stays as **information**,
which is all it has ever been — it renders the list today and never disables the
button.

Note this is _not_ the same option as `col.reference(…).onDelete`, which is a
real SQL foreign key on a real column, is enforced by SQLite, and is untouched.
The two shared a name and not a vocabulary; the content-field one is deleted.

## Rejected: a declared reverse field (deferred, not refused)

Reverse lookup needs no declaration — it is an indexed read, and one query
predicate covers the delete modal, media "used by" and filter-by-relation. A
declared virtual field would be sugar compiling to that same query, so it can
arrive later without touching storage.

If it returns, it is keyed on the **forward field path** and never on a relation
name. Payload, Keystone and Directus all key on path and cannot desync. Prisma
needs invented names only because it keys on the type _pair_. Strapi requires two
independently-written names that must agree, and that produced duplicate join
tables and silent relation-data loss (#14428, #15037).

## Rejected: filtering into the target's own fields

`posts where category = <id>` is supported and answered from the index.
`posts where author.name = 'X'` is not, and throws with guidance to resolve
first and then filter by id.

This is where every prior-art query layer becomes baroque. Strapi's own docs warn
that deep filters cause performance problems and advise hand-writing a route;
Payload's multi-hop dot notation is documented-broken (#2150). Keeping the index
the only fast path is what stops the query layer growing a join planner.

## A typo'd path throws

A `path` that does not exist in the resolved schema is a query-time error, not
zero results. The existing `where` allow-list drops unknown keys silently and
returns unfiltered rows with a confident-looking total, which is the worst
available behaviour and the one being replaced.

## Taxonomies stay entry types

No taxonomy table, no taxonomy plugin. WordPress needed a bespoke
`term_relationships` table because postmeta could not be reverse-queried or
filtered; the index gives that to every field, so the historical justification is
gone. A separate taxonomy model would duplicate admin UI, permissions,
localisation and versioning for "an entry with a name and a slug". A
plugin-owned table is worse — it would not participate in the index at all.

## Hierarchy and self-reference need no new machinery

Hierarchical categories are self-referential _one_-to-many — a single parent id
in the child's field data. A DAG is an array of parent ids. Genuine self-M2M
("related posts") is an array of ids on one side and N edges in the index.
"Children of X" is a reverse read.

The index is **directed**: A listing B does not make B list A. Reading it
undirected is a query flag, not a storage decision.

"All descendants" is the one tree query the index does not answer cheaply —
N hops or `WITH RECURSIVE`. That is a query concern, and building tree machinery
into storage to avoid it would buy one query at the cost of a second source of
truth.

## Symmetric relations are parked, and mirror-on-write is rejected

True symmetry is not storable under a single-source-of-truth rule: someone owns
the id. Keystone's mirror-on-write model is rejected because editing A would
create a new _version_ of B, touch its timestamp, and collide with any staged
copy of B — the same mass-write objection that killed `set-null`.

If it comes back, the framing is that symmetry is a **read** property: store
directed, merge both directions on read, and accept that the non-owning side
sees it read-only.

## Editorial identity lives on a profile entry, not on `users`

Users stay purely functional (auth). Editorial data lives on a `profile` /
`author` **entry** that relates to a user, so translation, versioning and
permissions all happen at the content layer where they already work.

The link lives on the **profile** (`profile.user`), never on `users`: an admin
may have no profile, a guest author may have no account, and `users` stays
untouched in both directions. "The profile for this user" is a reverse read.
This also decouples the model from the better-auth table-ownership question —
nothing needs to be added to `users` at all.

`createdBy` (which account wrote the row) and the byline (which profile gets
credit) are different fields and must not be conflated; they are frequently
different people. `createdBy` is a record of who did it, not a claim of
ownership, so deleting a user must never force content reassignment the way
WordPress does.

## Composite primary keys: grow `defineTable` rather than work around it

The index row has no identity of its own; its key is
`(sourceId, sourceKind, instancePath, targetId, targetKind)`. `defineTable`
could not express a table-level primary key, and the available workaround — a
synthetic ULID plus a unique index — would have been cheaper for this workstream.

It was rejected on principle: `defineTable` was built to support the codebase,
not to constrain it, and bending a schema around a missing feature is how a
schema system quietly stops being trusted. The engine grows the feature instead.

`WITHOUT ROWID` was considered alongside it and deferred. On a rowid table a
composite primary key is implemented as a unique index plus a hidden rowid, so
the storage win only arrives with `WITHOUT ROWID` — and our row sits right at
SQLite's recommended size boundary once an instance path carries nested ids. It
is a pure storage decision, takeable later without touching the logical schema.
