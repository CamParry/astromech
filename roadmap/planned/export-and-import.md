---
milestone: 1.0
---

# Export and import

Moving a site between hosts or runtimes means copying a database file, which
does not work for D1. `DECISIONS.md` ("A site owner changes the database only
through `astromech` CLI commands") promises an export command. Raised on
2026-10-04; decided 2026-10-05.

Command conventions are in `roadmap/planned/cli-commands.md`.

## What exists

`@astromech/backups` (`roadmap/completed/backups-plugin.md`) dumps and restores
a whole SQLite file, on local libSQL only. It cannot move a site to or from D1.

## Prior art

- **Strapi `export` and `import`:** a `.tar.gz` of content, files and config,
  optionally encrypted; `--only` and `--exclude`. Import deletes the target's
  data first, after a prompt that `--force` skips. `transfer` copies between
  two running instances.
- **WordPress WXR:** content only, no users' passwords or settings.
- **Payload** has no core export; its import-export plugin does CSV and JSON
  per collection. **Directus** `schema snapshot` and `apply` move the schema
  only.

## Decided (2026-10-05)

- **`astromech export <file>`** writes one `.tar.gz`: a manifest (Astromech
  version, the applied migrations, the plugins), one NDJSON file per table, and
  the media files. `--no-media` leaves the files out. Sessions and
  verification tokens are left out; users and their sign-in accounts are kept.
- **`astromech import <file>`** runs `db:migrate` first, refuses an archive
  made at a migration the site does not have, and refuses a database that
  already holds content. With `--force` it wipes the database and imports; in
  a terminal it still asks, and `--yes` skips the question. It finishes by
  rebuilding the relationship index and search text.
- **Plugin tables are included** when the plugin is installed on both sides;
  otherwise the import reports them and skips them.
- **Direct only,** never over HTTP (`roadmap/planned/cli-commands.md`).
- **CSV per entry type stays out of core,** for an import-export plugin. A
  WordPress (WXR) import is a plugin after 1.0, using
  `definePlugin({ commands })`.

## The work

- [ ] The archive format and its manifest.
- [ ] `export`: tables as NDJSON, media files streamed from storage.
- [ ] `import`: migrate, the version and empty-database checks, `--force`,
      rows in dependency order, media into storage, the rebuilds.
- [ ] Plugin tables on both sides.
- [ ] `apps/docs`: moving a site, including between libSQL and D1.

## Testing

An export from libSQL imports into an empty D1 and the reverse, with the same
entries, users, media files and relationships; an import into a database with
content is refused without `--force` and replaces it with it; an archive from a
newer migration is refused; sessions are not exported; a plugin table missing
on the target is reported and skipped.
