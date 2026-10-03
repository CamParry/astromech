# Relationship index defects

Found on 2026-10-03 while planning `roadmap/planned/drafts.md`.

- **The index has no locale.** `relationships` (`packages/astromech/src/database/tables.ts`)
  merges the references of every locale of a resource into one set
  (`packages/astromech/src/content/relationships.ts`). If the English version
  of an entry references A and the French version references B, a French page
  asking which entries reference A gets this entry back.
- **`where: { references }` matches staged-only references.** The filter
  (`packages/astromech/src/entries/repository/entries-table.ts`) does not check
  `sourceStaged`, so a reference held only by a staged change makes the live
  entry match, against the column's own comment.

The class: a reverse lookup answering for content the caller cannot see (another
locale, an unpublished change).

## Prior art

Craft's `relations` table has `sourceSiteId`: set for a localized field, null
for one shared across sites.

## The work

- [ ] A locale on each relationship row: a translatable relationship field
      records each locale's references under that locale; a shared field
      (`translatable: false`) records its references once with no locale.
- [ ] Reverse lookups and `where: { references }` take a locale and match that
      locale plus shared references.
- [ ] Exclude staged-only references from `where: { references }` now; drafts
      stop being indexed in `roadmap/planned/drafts.md`.
- [ ] Rebuild the index (`astromech index:rebuild`) as part of the migration.
- [ ] Tests for both.
