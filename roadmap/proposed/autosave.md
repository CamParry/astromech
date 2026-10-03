# Autosave

The editor form saves only when the editor clicks Save; a closed tab or an
expired session loses the work. Raised on 2026-10-03. **Target: 1.0.**

## Prior art

- **Craft 3.2** rebuilt drafts around autosave, as the base for its live
  preview.
- **Payload** autosaves drafts and updates one autosave version rather than
  adding a version per save.
- **Sanity** and **Contentful** save every change; **Kirby 5** keeps unsaved
  changes.

## Proposal

- A draft saves in place as the editor types (debounced).
- A published entry autosaves into its staged changes
  (`packages/astromech/src/entries/methods/staging/merge.ts`), so nothing goes
  live until the editor publishes.
- Autosaves update one rolling version instead of adding a version each time
  (`packages/astromech/src/content/versions.ts`).
- Globals, media and users: decide whether each autosaves, since globals and
  users have no draft.

## Open questions

- Is autosave on for every entry type, or a capability like `versioning`?
- How does it interact with validation: does an autosave store an invalid
  draft, as Payload does, and validate only on publish?
- Does it hold the editor lock (`roadmap/planned/editor-locking.md`)?
