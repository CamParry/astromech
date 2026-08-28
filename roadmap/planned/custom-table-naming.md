# Custom-Table Naming

Every entry type persists through a repository. Most use the shared `entries`
table; a plugin can bring its own table via `tableRepository`. The current
vocabulary hides that shape: "table-backed type" suggests a separate kind of
thing (all entry types are backed by a table), and "built-in repository" reads
as "ships with core" when `tableRepository` ships with core too. This work
renames both, records the decisions, and closes the door on custom-built
repositories.

## Decisions made

- **"Custom table" replaces "table-backed type".** There is one concept, the
  entry type; a subset of entry types have a custom table. "Custom table" is
  WordPress vocabulary for exactly this (plugin data outside the shared posts
  table), so it needs no teaching. Rejected: keeping "table-backed" (implies a
  second kind of thing).
- **The default repository is named for its storage, not its role:**
  `createEntriesTableRepository` in `entries/repository/entries-table.ts`.
  "Default" stays the right word in prose for the registry fallback ("a type
  resolves to its own repository when one is mounted, else the entries-table
  repository"). Rejected: `default.ts` / `createDefaultEntryRepository`
  (greps badly, collides mentally with default exports, and only makes sense
  from inside the registry); keeping "built-in" (means "ships with core" for
  field types, cells and plugins, and both repositories ship with core).
- **`BUILT_IN_SUPPORTS` becomes `ALL_CAPABILITIES`.** The entries-table
  repository supports every capability, and the fallback in
  `config/resolve.ts` then reads honestly:
  `entryType.repository?.supports ?? ALL_CAPABILITIES`.
- **`hasEntryRepositoryOverride` becomes `hasCustomTable`.** Callers never ask
  "is there an override"; they ask whether a type has rows outside the shared
  `entries` table (`dangling-relations.ts` uses it negated). Same rename
  smell, same fix.
- **No custom-built repositories.** `EntryRepository` is an internal seam, not
  an extension point. `tableRepository` is the only supported way to give an
  entry type its own persistence. `EntryType['repository']` is narrowed to the
  branded return type of `tableRepository` so a structural implementation no
  longer type-checks. Rejected: publishing `EntryRepository` as a public
  adapter surface (a compatibility promise on an internal contract, for a use
  case nothing needs).
- **Scope boundary:** "built-in" is correct everywhere else (built-in field
  types, built-in cells, built-in plugins = ships with core) and is not
  touched outside `entries/repository/`.
- **`tableRepository` keeps its name.** It is literal and already public.

## The work

- [ ] Rename `packages/astromech/src/entries/repository/built-in.ts` to
      `entries-table.ts`; `createBuiltInEntryRepository` →
      `createEntriesTableRepository`. In `registry.ts`: local `getBuiltIn` →
      `getEntriesTable`, globalThis key `entryRepositoryBuiltIn` →
      `entriesTableRepository` (process-local, nothing persists it), and the
      header comment rewritten in the default/entries-table vocabulary.
- [ ] `BUILT_IN_SUPPORTS` → `ALL_CAPABILITIES` in
      `entries/capabilities.ts` and its use in `config/resolve.ts`.
- [ ] `hasEntryRepositoryOverride` → `hasCustomTable` in
      `entries/repository/registry.ts` and callers:
      `entries/internal/relationships.ts`,
      `entries/internal/dangling-relations.ts`,
      `transport/cli/validate-stored-content.ts`.
- [ ] `tableBackedEntrySources` → `customTableEntrySources`
      (`entries/internal/relationships.ts`); `tableBackedEntryTypes` →
      `customTableEntryTypes` (`transport/cli/validate-stored-content.ts`).
- [ ] Narrow the public surface: export the branded type of
      `tableRepository`'s return (a class with a private member is enough for
      nominality), type `EntryType['repository']` with it in
      `types/config.ts`, and keep `EntryRepository` unexported.
- [ ] Prose sweep for "table-backed" and repository "built-in": comments in
      `entries/repository/table.ts`, `transport/cli/commands/index-rebuild.ts`,
      `transport/cli/commands/validate.ts`, the four test files that mention
      `tableBacked`, `packages/plugins/redirects/README.md`,
      `packages/plugins/forms/README.md` (also replace its ad-hoc
      "core-stored" with "stored in the shared entries table"),
      `apps/docs/README.md`, `apps/docs/content/relationships.md`,
      `ARCHITECTURE.md` (the vocabulary line), and the `types/config.ts`
      doc comments that say "built-in repository".
- [ ] `TERMINOLOGY.md`: replace the "Table-backed type" entry with a "Custom
      table" entry stating the model — every entry type persists through a
      repository; the default is the shared `entries` table; a custom table
      shares the entries interface and none of the internals.
- [ ] `DECISIONS.md`: one entry for the vocabulary (what "custom table" and
      "entries-table repository" beat and why), one for "no custom-built
      repositories".
- [ ] Gate, plus `pnpm run check:node-imports` (the narrowed
      `EntryType['repository']` type is plugin-facing).

## Out of scope, flagged for discussion

Three layers currently share the word "repository": the module repositories
(`users`, `media`, ...), the `EntryRepository` seam, and the database-layer
`createRepository`. Whether any of them should be renamed is a separate
conversation; nothing here touches the word itself.
