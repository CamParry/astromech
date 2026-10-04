---
milestone: later
---

# AI fills the editor form

`src/content/` was deleted: the `translate`, `transform` and `generate` methods,
the never-implemented `ContentProvider` port, and their routes, permissions and
types. They were discoverable as tools yet failed at runtime, and their shape
depended on a UI that had not been designed. Removing them also dissolved the
layer model's one cross-module import exception, which should not be reopened
casually.

Decided on 2026-10-03: they do not come back as methods. The assistant fills
the open editor form and the human saves.

## Prior art

- **Sanity's agent actions** never write to a published document: output goes
  to the draft or a release, and a translation can create a new document.
- **Directus's assistant** fills the open form ("changes are local until the
  user saves"); writing to the database is a separate tool behind an approval.
- **Contentful's AI Actions** suggest in the entry editor and send bulk runs to
  a review screen. Running one needs its own permission, applying it the
  entry's edit permission.
- **payload-ai** (community) writes into the form and adds a `generate` access
  check.
- **Strapi AI** translates every locale on save and overwrites manual edits:
  the case to avoid.

## Decided

- **The assistant fills the open form; the human saves.** One client-side tool
  sets field values by path, for one field or the whole entry. The output is
  reviewed in the form the editor already uses, so it is never written unseen
  and no new mutating method or cross-module import is needed. Rejected:
  `translate`, `transform` and `generate` methods that write to an entry.
- **Translation opens the target locale's form** filled in and unsaved. Nothing
  translates on save.
- **Permissions:** the save is the entry's own `update`. Using the assistant at
  all is `@astromech/assistant`'s existing `use` permission, which is the
  site's control over model cost.
- **Bulk** waits for a designed review screen, as Contentful's has.

## Open

- [ ] The form tool's design: how the assistant reaches the open form, how the
      editor sees what it changed, and undo. Waits for the editor screen work.
