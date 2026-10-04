---
milestone: 1.0
---

# Search and replace

Changing a domain, a product name or a moved URL across stored content means
editing every entry by hand. Raised on 2026-10-04; decided 2026-10-05.

Shares its value walker and safety steps with
`roadmap/planned/field-rename-command.md`. Command conventions are in
`roadmap/planned/cli-commands.md`.

## Prior art

- **WP-CLI `search-replace`:** `--dry-run`, `--regex`, `--precise`, table and
  column filters, and unserialising PHP values so their lengths stay right; a
  common guide skips the `guid` column.
- **Better Search Replace** (WordPress plugin): the same from the admin, a dry
  run first.
- Headless CMSs (Payload, Strapi, Directus, Sanity) have no built-in command;
  sites write a migration script.

## Decided (2026-10-05)

- **`astromech search-replace <old> <new>`** reports counts per table, locale
  and field path, with a few before-and-after samples, and writes nothing
  unless given `--apply`. `--json` is supported.
- **It works on stored values, not the raw JSON text,** so it can never break
  a document's structure. Only string values change, never keys. Rich text is
  walked to its text and link values; a match split across formatting marks is
  not found, and the docs say so.
- **Scope:** content rows in every locale and drafts, for entries, globals and
  media fields. `--type <type>`, `--global <key>`, `--media` and `--locale`
  narrow it. Slugs (`--include-slugs`) and history records
  (`--include-history`) are left alone unless asked, since a slug change moves
  a URL and history records what was.
- **`--regex`** for patterns, with `$1` style references in `<new>`.
- **After `--apply`,** the relationship index and search text are rebuilt for
  every changed row, and the live page cache is cleared as
  `roadmap/planned/cli-commands.md` describes for a direct write.
- **Safety, as `fields:rename`:** a local database is dumped first, and on D1
  the command prints the Time Travel restore point. Each changed value is
  checked against its field; the dry run lists failures and `--apply` refuses
  while there are any. One audit trail row with the counts; no hooks per entry.
- **Direct only,** never over HTTP (`roadmap/planned/cli-commands.md`).

## The work

- [ ] The value walker shared with `fields:rename`, including rich text.
- [ ] The command: scope flags, `--regex`, the dry-run report, `--apply`.
- [ ] Field checks, the dump or restore point, the audit row.
- [ ] Rebuild relationships and search text for changed rows; the cache clear.
- [ ] `apps/docs/cli.md`.

## Testing

A replace changes a value in every locale and draft and leaves history and
slugs alone unless asked; a key matching `<old>` is never renamed; a match in a
rich-text link changes and the document stays valid; a value failing its
field's check blocks `--apply`; the dry run writes nothing; a changed
relationship value updates the index.
