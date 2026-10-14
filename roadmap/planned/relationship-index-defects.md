---
milestone: 1.0
---

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
for one shared across sites. Payload's `_rels` table has a nullable `locale`,
set for a `localized: true` relationship field. Both store a shared field once.
Strapi 5 stores each locale of a document as its own row with its own relation
join rows, and copies non-localized fields into every locale's row. Astromech
stores shared fields the Strapi way (`content/translatable.ts`), so its index
follows that.

## The work

- [ ] A locale on each relationship row, never null: the locale of the content
      row holding the reference. A shared field (`translatable: false`) is
      copied into every locale's row, so its reference is indexed once per
      locale.
- [ ] `where: { references }` matches the references of the content row it
      returns, in that row's locale. `usedBy` and other delete-time reads span
      every locale and report the locales holding each reference.
- [ ] Exclude staged-only references from `where: { references }` now; drafts
      stop being indexed in `roadmap/planned/drafts.md`.
- [ ] The migration recreates the table empty; run `astromech index:rebuild`
      after it. Nothing runs a rebuild after migrating.
- [ ] Tests for both.
