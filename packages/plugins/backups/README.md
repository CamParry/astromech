# @astromech/backups

Scheduled and on-demand database backups. A cron job dumps the database, gzips
it, and writes the artifact to plugin storage (R2, filesystem, or whatever
driver the site configures); an admin page lists the run history and offers
trigger, download, restore and delete. Old artifacts rotate away on a retention
count, and every run — success or failure — is recorded in the plugin's own
table.

Backups is the repo's worked example of a plugin with a **database table**, a
**cron job**, **plugin storage**, and **raw HTTP routes** for the two endpoints
that stream.

## Layout

```
backups/
  src/index.ts                  definePlugin() — identity + composing the surfaces below
  src/types.ts                  BackupsOptions + BACKUPS_PACKAGE
  src/tables/runs.ts             definePluginTable — the `runs` table
  src/tables/index.ts            the ./tables subpath entry (tables only)
  migrations/                   generated — never hand-edited
  src/storage.ts                createStorage over the table — the only DB access
  src/backup.ts                 performBackup / rotate / resolveKeep — the core work
  src/service/backups.ts        listRuns, triggerRun, deleteRun (JSON, over RPC)
  src/routes/backups.ts         download + restore (raw routes — they stream)
  src/permissions/backups.ts    definePermissions — the grantable permission keys
  src/pages/backups.ts          defineAdminPage — the run history page
  src/pages/settings.ts         defineAdminPage — the retention settings form
  src/admin/pages/backups-page.tsx  the page renderer (browser asset)
  src/locales/en.json           i18n bundle
```

## Install

```ts
// astromech.config.ts
import { backups } from '@astromech/backups';
import { defineConfig } from 'astromech';

export default defineConfig({
    plugins: [
        backups({
            schedule: '0 3 * * *', // cron expression; default is 03:00 daily
            keep: 7, // artifacts to retain; default 7
        }),
    ],
});
```

Both options are optional. `keep` is a _fallback_ — the **Backups → Settings**
admin page holds a `retention` value, and that wins when set, so an admin can
change retention without a redeploy. Like every settings page it stores one blob
under its own key: `plugin:backups:/settings` → `{ "retention": 7 }`.

`schedule` has no settings equivalent — cron jobs are registered at boot, so
changing the schedule needs a redeploy.

The plugin owns a table, so run the migration step for it the same way as any
other table-bearing plugin (`astromech plugin:generate` at authoring time; the
generated `migrations/` ship with the package).

## Identity

`package: '@astromech/backups'` is the only identifier declared. The
`@astromech/` scope is stripped when deriving, and `backups` is a single word,
so both derived forms come out identical:

| form        | value     | where it appears                                           |
| ----------- | --------- | ---------------------------------------------------------- |
| namespace   | `backups` | permissions, settings keys, i18n, admin URLs, table prefix |
| service key | `backups` | `Astromech.plugins.backups`, `/api/plugins/backups/…`      |

The table is `plugin_backups_runs` — `definePluginTable` owns that prefix, so
the table declares the bare name `runs`.

## Permissions

| key        | grants                                              |
| ---------- | --------------------------------------------------- |
| `read`     | List backup runs and artifact metadata              |
| `run`      | Trigger a backup manually                           |
| `download` | Download an artifact — a **complete database dump** |
| `restore`  | Restore the database from an artifact               |
| `delete`   | Delete artifacts from storage                       |

There are no bundles. A role enumerates the keys it grants, which is the whole
point of an opt-in model — you can see what a role can do by reading it:

```ts
roles: {
    'ops': {
        name: 'Ops',
        permissions: [
            ...builtInRole('editor'),
            ...backups.permissions('read', 'run'),
        ],
    },
}
```

`plugin:backups:*` is the all-or-nothing escape hatch if you really do want
every key, present and future.

`download` is deliberately **not** part of `view`. An artifact is a dump of
every table — user records, password hashes, private settings — so being able
to see that a backup ran is a much smaller grant than being able to pull it
down. Grant `download` only to roles you would trust with the database itself.

## Service methods

```ts
const { runs, capabilities } = await Astromech.plugins.backups.listRuns();
const result = await Astromech.plugins.backups.triggerRun();
await Astromech.plugins.backups.deleteRun({ id: run.id });
```

`capabilities` is feature-detected per request (`canDump`, `canRestore`) —
whether a backup is even possible depends on the database driver, so the UI
greys out actions rather than failing them.

`triggerRun` and `deleteRun` return a result rather than throwing on the
expected failures: `{ ok: false, reason: 'already-running' }` and
`{ ok: false, reason: 'not-found' }`.

## Raw routes

Two endpoints stream, so they are `rawRoutes` rather than service methods:

| route                                        | permission | why raw                          |
| -------------------------------------------- | ---------- | -------------------------------- |
| `GET /api/plugins/backups/runs/:id/download` | `download` | streams a gzipped artifact out   |
| `POST /api/plugins/backups/runs/:id/restore` | `restore`  | streams a gunzipped dump back in |

Restore takes a safety snapshot of the current database **before** overwriting
it, so the operation is reversible, and preserves the plugin's own run table
and the cron table across the restore — otherwise a restore would erase the
record of itself.

## Admin surface

- **Backups** — `/admin/plugin/backups` (requires `plugin:backups:read`). Run
  history with status, trigger, size and per-row download / restore / delete.
  Restore and delete both go through a confirmation dialog.
- **Settings** — `/admin/plugin/backups/settings` (requires `settings:read`, and
  `settings:update` to save). The retention count.

## Rotation

After every successful run, artifacts beyond the newest `keep` are deleted from
storage; the run row stays, marked `artifactDeletedAt`, so the history is intact.

`pre-restore` snapshots are exempt: they are the undo for a restore, so they
neither count against `keep` nor get rotated away. Delete one by hand from the
run history when it is no longer wanted.
