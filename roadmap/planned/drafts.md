---
milestone: 1.0
---

# Drafts

Replace staged changes with drafts: every edit to a published entry or global
goes into one draft per locale, and the live content changes only when the
draft is published. Decided 2026-10-03 (`DECISIONS.md`, "Published content
changes through a draft").

Together with `roadmap/planned/history.md` and `roadmap/planned/schedules.md`,
this is the editorial model; `roadmap/planned/autosave.md` and
`roadmap/planned/live-preview.md` build on it.

## What exists

- A staged change is a second row in `entry_content` (or `global_content`) with
  `stagedFor` pointing at the live row, at most one per locale, created by hand
  ("Stage change") and merged by hand. The `staging` capability is off by
  default. `stagedFor` appears in 36 lines of source, and two bugs came from
  rows that forgot to filter it.
- A merge copies the staged row into the live row, keeps the status, fires no
  hooks and does not propagate shared fields.
- Saving a published entry without staging writes the live row.

## Prior art

- **Automatic pending copy:** Sanity, Contentful, Strapi 5, Statamic, Kirby 5,
  EmDash, Craft (provisional drafts) and Payload (with drafts on). Only
  WordPress core and Ghost edit live content directly.
- **Strapi 5** keeps draft and published rows in one table and re-creates rows
  on publish; broken and dropped relations are its largest bug class (#23460,
  #25361, #21355). **Craft** keeps drafts as full elements in the live tables,
  so every query filters them out.
- **EmDash** keeps the published data in the entry's columns and the draft
  elsewhere, and publishes by copying the draft in.

## Decided (2026-10-03)

- **Every type with statuses has drafts.** The first change to a published
  locale creates its draft; every later edit, from the admin or the API, goes
  into it. The live row changes only on publish. An unpublished entry is edited
  directly, since nothing about it is public. Types without statuses keep
  editing live, as Sanity's `liveEdit` does.
- **Drafts have their own table:** `entry_drafts` and `global_drafts`, at most
  one row per entry (or global) and locale. A draft is keyed the way a content
  row is, by `entryId` (or `globalId`) and `locale`, with no pointer to the
  content row (`stagedFor` goes). It carries the content columns
  (title, slug, fields) defined once and shared with the content and history
  tables. The content table holds only live or unpublished content, so the
  `stagedFor` filters and partial unique indexes go. Rejected: a second row in
  the content table (today's staging), which every query and index must
  filter.
- **Publish publishes the draft** in one action: the draft's content is copied
  into the existing live row (its id never changes), the draft is deleted, a
  history record is written and relationships are rebuilt, in one D1
  `batch()`. **Discard changes** deletes the draft. **Unpublish** folds the
  draft into the row, since nothing is public any more. The "Stage change"
  button, the merge step and the `staging` capability go.
- **Naming:** "draft" for the pending changes. Statuses stay `unpublished` and
  `published`, so "draft" never names a status. Rejected: "staged change" (no
  other CMS uses it) and "working copy" (Statamic).
- **Relationships index live content only.** A draft's references are not
  indexed, so a site's `where: { references }` never sees them and needs no
  check. "Used by" and the delete warning also read references from the drafts
  table, so the admin still warns that something is used in a pending draft.
  Publishing rebuilds the index from the new live content, and the field
  pipeline drops references to targets deleted meanwhile.
- **Guards:** a draft's slug and `unique` fields are checked against live rows
  when the draft is saved, scheduled and published; publishing keeps its own
  permission; publish fires the update hooks with the final content; draft
  saves fire `*Draft` events (the `*Staged` events in
  `roadmap/planned/hooks.md`, renamed).
- **Preview** shows the draft, and preview tokens no longer depend on a
  capability.
- **Media and users** have no drafts in 1.0: replacing a media file cannot be a
  draft, and a user's email, role and password must apply at once. The drafts
  table works for any resource, so either can add them later.

## The work

- [ ] The drafts tables and the shared content-column definition, with
      `pnpm run db:generate` and the Cloudflare baseline hand-applied; drop
      `stagedFor` and its indexes; migrate existing staged rows into drafts.
- [ ] Update writes to a published locale into its draft; publish, discard and
      unpublish as decided; remove the staging methods, routes and capability.
- [ ] Relationships: index live content only; "used by" and delete warnings
      read drafts too.
- [ ] Slug and `unique` checks for drafts; hooks on publish; `*Draft` events.
- [ ] Shared fields propagate to the other locales' live rows and drafts on
      publish.
- [ ] The admin: no staged routes; "Published · Changed" in the badge and the
      list; Publish changes and Discard changes; preview shows the draft.
- [ ] `TERMINOLOGY.md` (Draft replaces Staged change), `ARCHITECTURE.md` and
      `apps/docs` once it lands.

**Planned work that assumes staging and must follow this file:**
`roadmap/planned/hooks.md` (staged events), `roadmap/planned/write-race-and-data-loss-defects.md`
(the `stagedFor` unique index), `roadmap/planned/full-text-search-indexing.md`
and `roadmap/planned/field-value-query-indexing.md` (staged-row predicates),
`roadmap/planned/naming-conventions.md` and
`roadmap/planned/derive-from-one-source.md` (staging names and sites), and
`roadmap/in-progress/module-cleanup.md` (the two merge rules).

## Testing

An edit to a published entry leaves the public read unchanged until publish;
publish keeps the live row's id and item `_id`s; discard restores the live
content in the editor; a draft-only reference is absent from
`where: { references }` and present in "used by"; a draft slug clashing with a
live one is refused on save and publish; unpublish keeps the draft's content.
