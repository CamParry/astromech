---
milestone: 1.0
---

# Renaming a field's stored values

Renaming a field in the config leaves its stored values under the old name, and
nothing moves them. Raised on 2026-10-03; decided 2026-10-04.

## What exists

- `astromech validate`
  (`packages/astromech/src/content/validate-stored-content.ts`) cannot
  report a renamed field's old values: `safeParseFields` drops undeclared root
  keys before it checks anything
  (`packages/astromech/src/fields/parse-fields.ts`), and nested keys are never
  checked.
- A save drops undeclared root keys (`projectToSchema` in
  `packages/astromech/src/fields/values.ts`, called from
  `packages/astromech/src/content/prepare-fields.ts`) but keeps undeclared
  nested ones. So a save between deploying the renamed config and moving the
  values loses the old value.
- Public reads keep undeclared keys
  (`packages/astromech/src/content/visibility.ts`), so a renamed or removed
  `private: true` field is served publicly (`roadmap/in-progress/operations-defects.md`).

## Prior art

- **Sanity:** migrations are files run from its CLI, a dry run unless given
  `--no-dry-run`; `setIfMissing` and `unset` per path.
- **Craft 5** keys content by a field's UID, so a handle change is free;
  `craft fields/merge` merges two fields. **Contentful** separates a field's id
  from its name; contentful-migration's `changeFieldId` is a schema call and it
  has no type change.
- **No rename:** Directus (`updateField` has no rename path), Strapi (a rename
  creates a new field, and the old values stay in the database out of reach),
  Payload (hand-written migrations).

## Decided

- **The config does not migrate content** (2026-10-03). Nothing in the config
  can tell a rename from a deletion plus a new field. Rejected: rename
  detection, a `renamedFrom` option, and a stable field id written into the
  config (Craft, Contentful), which config-as-code would make by hand.
- **A separate command moves the values** (2026-10-03), as Sanity's migrations
  are files run from its CLI.
- **`astromech fields:rename <from> <to>`** (2026-10-04) with exactly one of
  `--type <type>`, `--global <key>`, `--media` or `--users`, since media and
  users have custom fields too. It reports counts per table and locale and
  writes nothing unless given `--apply`; `--json` is supported.
- **Paths** use the existing grammar (`packages/astromech/src/fields/field-path.ts`):
  `seo.title` for a named group, `sections[].title` for every repeater or tree
  item. `<to>` must be declared in the config and `<from>` must not, or the
  command refuses; this catches typos and settles blocks, where a value moves
  only in items whose block declares `<to>`. A value may move between groups
  (`title` to `seo.title`) but not across a repeater boundary. Renaming a block
  type is out of scope.
- **Tables:** content rows in every locale, trashed ones included; drafts;
  history records, since a restore would otherwise drop the old key silently.
  The relationship index and search text are rebuilt for every changed row.
  Field-value indexes come from config, so their migration runs first.
  Schedules hold no field data.
- **Safety:**
    - A row where `<to>` already holds a value is skipped and reported;
      `--overwrite` replaces it.
    - Each moved value is checked against the target field; the dry run lists
      failures and `--apply` refuses while there are any.
    - Root and group paths are one `json_set`/`json_remove` statement per table,
      atomic on libSQL and D1; array paths are rewritten per row. A rerun moves
      nothing already moved.
    - Before `--apply`, a local database is dumped; on D1 the command prints the
      Time Travel restore point.
- **Saves keep undeclared keys; public reads drop them.** This closes the gap
  between deploying the config and running the command, and the privacy leak.
- **`fields:remove <path>`** ships with it, since it is the same code with
  `unset` in place of the move. Changing a field's type stays a hand-written
  migration (`DECISIONS.md`).
- **No hooks per entry**, and one audit trail row with the target and the
  counts. The page cache is cleared as for any direct write
  (`roadmap/planned/cli-commands.md`).
- **The value walker is shared** with `roadmap/planned/search-replace.md`.
- **`validate` reports undeclared keys at every depth** and suggests the
  command; the field docs and `cli.md` say a rename leaves values behind.

## The work

- [ ] Keep undeclared keys on save; drop them on public reads.
- [ ] `fields:rename` and `fields:remove`: paths, the dry run, `--apply`,
      `--overwrite`, value checks, the dump or restore point.
- [ ] Rewrite content, drafts and history; rebuild relationships and search
      text for changed rows.
- [ ] The audit row and the cache clear.
- [ ] `validate` reports undeclared keys at every depth.
- [ ] `apps/docs`: fields and the CLI.

## Testing

A root, group and repeater rename moves values in every locale, draft and
history record; a conflicting row is skipped and reported; a value failing the
target field's check blocks `--apply`; a rerun changes nothing; a save between
the config change and the command keeps the old value; a public read never
returns an undeclared key; a renamed relationship field keeps its index rows.
