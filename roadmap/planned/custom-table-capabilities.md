# Custom-Table Capabilities

`tableRepository` declares `supports = []`
(`entries/repository/table.ts`), so an entry type with a custom table gets no
trash, statuses or slug even when its table has the columns. The capability
plumbing is already correct — `config/resolve.ts` intersects the entry type's
flags with `repository.supports` — so the gap is entirely inside
`tableRepository`. Depends on the rename in `custom-table-naming.md` landing
first (shared files, and this work should be written in the new vocabulary).

## Decisions made

- **Capabilities are derived from column presence**, extending the convention
  the repository already uses for `createdBy`/`updatedBy`: a `deletedAt`
  column enables `trash`, a `status` column (with `publishedAt`) enables
  `statuses`, a `slug` column enables `slug`. No new options object; the
  table's shape is the declaration. Rejected: an explicit
  `capabilities: [...]` option on `tableRepository` (a second source of truth
  that can disagree with the columns).
- **`versioning`, `staging` and `translatable` stay unsupported.** Each needs
  side tables and lifecycle the plugin's table cannot express. A plugin that
  needs them stores its type in the shared `entries` table.

## The work

- [ ] Derive `supports` in the `TableRepository` constructor from the table's
      columns per the rules above; the enabled columns join the reserved set
      so they stop appearing in `fields`.
- [ ] Populate `EntryRow.status`, `publishedAt` and `deletedAt` (and `slug`)
      in `toRecord` when the columns exist.
- [ ] Implement the `trash` group (`trash`/`restore`/`emptyTrash` over
      `deletedAt`), and make `list`/`get` honor `trashed`/`includeTrashed`.
- [ ] Implement `uniqueSlug` over the `slug` column (currently throws).
- [ ] Make `list` handle status filtering the way the entries service expects
      from the entries-table repository — check `entries/service.ts` call
      sites for the exact contract before writing.
- [ ] Tests in `packages/astromech/tests/` mirroring the entries-table
      repository's capability tests, over a scratch table that declares the
      columns.
- [ ] Docs: the redirects and forms READMEs say all entry capabilities are off for
      custom tables; soften to "off unless the table declares the columns".
      `TERMINOLOGY.md` "Custom table" entry gets the one-line rule.
- [ ] Gate, plus `pnpm run check:boot` (touches the entries serving path).

## Review: relations pointing at custom-table types

Marked for review, not yet designed. Today `tableRepository` refuses
`references` filters (`RelationshipFilterUnsupportedError`,
`entries/repository/table.ts`) and `apps/docs/content/relationships.md`
documents the limits. Review what works, what fails and how loudly, and decide
whether the refusals become support or clearer errors. Output is a decision
and, if needed, its own roadmap file.
