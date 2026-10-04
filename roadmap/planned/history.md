---
milestone: 1.0
---

# History

Replace versions with history: a record of each published state, kept in its own
table per resource. Decided 2026-10-03 (`DECISIONS.md`, "History records
published states, in its own table"). Builds on `roadmap/planned/drafts.md`.

## What exists

- `entry_versions`, `global_versions`, `media_versions` and `user_versions`
  hold a copy of a content row taken **before** each write that changes it, so
  the current state is never a version and the newest version is the state
  before the last save.
- Versions are keyed on the content row id with cascade delete, so versions of
  a staged row vanish when it is merged or discarded.
- `maxVersions` is declared in config and read nowhere; nothing prunes.
- Version numbers come from `max + 1` with no unique index.
- Restore writes the old state into the live row, skipping hooks, the field
  pipeline (so dead references come back) and shared-field propagation.

## Prior art

- **One table for everything** (WordPress, Craft, Umbraco, Drupal): every query
  filters history out, unique indexes break (Craft's duplicate revision
  numbers, Sanity #8724), and cleanup jobs fight live traffic (Umbraco #14195).
- **Mirrored tables** (Payload's `_v`): two schemas to migrate, and a `latest`
  flag kept across statements, which duplicates rows on D1 (#17216).
- **A separate history table** (Ghost, Strapi, Directus, EmDash): live tables
  stay small; old records can stop matching the schema (Strapi restores fail
  after component changes).
- **Pruning:** Craft and EmDash keep 50, Payload 100, Ghost 25. EmDash never
  deletes a record a pointer uses; Umbraco, Craft and Directus learned to prune
  off the save path in small batches.

## Decided (2026-10-03)

- **History records published states only.** A record is written when content
  changes what is live: a publish, or a save on anything without drafts (media,
  users, entry types without statuses). Draft saves and autosave never write
  history. An entry has no history until its first publish.
- **Its own table per resource:** `entry_history`, `global_history`,
  `media_history` and `user_history`, with the content columns defined once and
  shared with the content and drafts tables, so moving between them is column
  to column. A record adds its number, the resource id and locale, and when and
  by whom it was published. It does not copy row state (status, trash).
  Rejected: history rows in the content table, which every query and index
  must filter; and pointers to live and draft records (EmDash), which drift
  when a write skips the history path.
- **Keyed the way a content row is**, by `entryId` (`globalId`, `mediaId`,
  `userId`) and `locale`, not by the content row, so history survives a draft
  being deleted. A unique index on (`entryId`, `locale`, `number`) closes the
  numbering race.
- **Restore writes the record into the draft** (or the live row where there are
  no drafts) through the full field pipeline, which drops dead references and
  lists fields the schema no longer has. Publishing it writes a new record.
- **Pruning:** `history: { max: 50 }` by default, replacing `maxVersions`. A
  scheduled job prunes in small batches and never deletes the record of the
  current live state.
- **Naming: "history" throughout**, and one row is a "history record". The
  admin panel is History. Rejected: "versions", which suggests the newest is
  the active one; and mixing "revisions" with "history".
- **Media and users get history** the same way.

## The work

- [ ] The history tables, with `pnpm run db:generate` and the Cloudflare
      baseline hand-applied; migrate existing versions (each becomes a
      record); drop the versions tables.
- [ ] Write a record on publish and on live saves; remove pre-write snapshots.
- [ ] Restore into the draft through the field pipeline.
- [ ] The pruning job and `history.max`.
- [ ] Rename across the code, routes, the `versioning` capability, the admin
      (History panel, labels) and `astromech/fetch`; `TERMINOLOGY.md` and
      `apps/docs` once it lands.
- [ ] The audit trail's "version the write took"
      (`roadmap/planned/audit-trail.md`) becomes the history record.

## Testing

A draft save writes no record; publish writes one; two concurrent publishes
cannot share a number; restore lands in the draft and drops a reference to a
deleted target; pruning keeps the live state's record; deleting a draft keeps
history.
