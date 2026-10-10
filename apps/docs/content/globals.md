# Declaring globals

A **global** is one editor-owned item with no list: a site's name and footer, a
homepage hero, a set of social links. There is exactly one of it, and it exists
because your config declares it. Everything an entry carries, a global carries
too: fields, locales, statuses, versions and staged changes.

Anything an editor fills in through a form is a global. Config and secrets stay
in `astromech.config.ts` and `.env`.

## Declaring a global

Globals go in the top-level `globals` array, beside `entries`. Each one carries
its own `key`, as each entry type carries its own `type`:

```ts
// astromech.config.ts
import { defineConfig, defineGlobal } from 'astromech';
import * as fields from 'astromech/fields';

export default defineConfig({
    entries: [
        /* … */
    ],
    globals: [
        defineGlobal({
            key: 'site',
            label: 'Site',
            icon: 'Globe',
            translatable: true,
            public: true,
            fields: [
                fields.text('siteName', { label: 'Site Name' }),
                fields.textarea('footerText', { label: 'Footer Text' }),
                fields.media('logo', { label: 'Logo', translatable: false }),
            ],
        }),
    ],
});
```

`defineGlobal` is an identity function, like `defineEntryType`: it type-checks
the object where you write it, so a global authored in its own module reports an
error at the mistake rather than at the spread site.

| option         | default | what it does                                                       |
| -------------- | ------- | ------------------------------------------------------------------ |
| `key`          | —       | the identifier, unique across the site. No `/` or `:`.             |
| `label`        | —       | the sidebar label and page title.                                  |
| `icon`         | a globe | a Lucide icon name for the sidebar.                                |
| `fields`       | —       | a flat array, or `{ main, sidebar }`, exactly as on an entry type. |
| `translatable` | `false` | one content row per locale, rather than one row.                   |
| `statuses`     | `true`  | draft / published / scheduled. `false` means every save is live.   |
| `versioning`   | `true`  | snapshot the previous state on every change to the fields.         |
| `staging`      | `false` | allow a staged change alongside the live one. Requires `statuses`. |
| `public`       | `false` | an unauthenticated `get` returns the published content.            |
| `nav`          | `true`  | show the global in the admin sidebar.                              |
| `validate`     | —       | a whole-resource validator, as on an entry type.                   |

A key is developer-written and locale-invariant. It never appears in a
front-end URL, so it is a `key`, not a `slug`.

A global has no row until something writes to it. Reading a declared but unsaved
global returns `null`; the first `update` creates it.

## Reading a global from your site

```astro
---
import { getAstromech } from 'astromech';

const app = await getAstromech();
const site = await app.globals.get({ key: 'site', locale: 'en' });
const siteName = site?.fields.siteName ?? 'Astromech';
---
```

Omit `locale` and you get the default content locale. `get` never falls back to
another locale: a translatable global with no row for the locale you asked for
is `null`.

An Astro page renders with no signed-in user, so the read is unauthenticated.
That succeeds only for a global declared `public: true`, and it returns the
**published** content with any role-restricted fields removed. A global that is
not public needs the read permission.

Pass `full: true` from trusted server code to get the stored content whatever
its status, including role-restricted fields:

```ts
const draft = await app.globals.get({ key: 'site', full: true });
```

`Astromech.globals` is typed from your config, so `site.fields.siteName` is
typed as the field declares it.

## Reading a global from a plugin

A plugin reaches the one globals service through `ctx.globals`. It is not
scoped: a plugin's own globals are addressed by the qualified key
`<namespace>/<key>`, which the plugin builds from its context rather than
hard-coding.

```ts
const settings = await ctx.globals.get({
    key: `${ctx.plugin.namespace}/settings`,
    full: true,
});
const mediaId = settings?.fields['defaultOgImage'];
```

A plugin declares its own globals in a `globals` array on the plugin
definition, the same shape a site uses:

```ts
export const settingsGlobal = defineGlobal({
    key: 'settings',
    label: 'Settings',
    icon: 'Settings',
    statuses: false,
    fields: [fields.media('defaultOgImage', { label: 'Default Open Graph image' })],
});

export const seo = definePlugin({
    package: '@astromech/seo',
    globals: [settingsGlobal],
});
```

`statuses: false` above is deliberate: the value the plugin reads is whatever
was last saved, with no publish step in between. Leave statuses on for a global
an editor drafts.

## The admin

A host global with `nav: true` appears in the sidebar's Globals block and edits
at `/cms/globals/<key>`, with its history at `/cms/globals/<key>/versions`. A
plugin's appears in that plugin's nav tree, at
`/cms/plugin/<name>/globals/<key>`.

The edit screen is the entry edit screen: the same field form, publish panel,
locale switcher and staged-change controls. A global that has never been saved
opens as an empty form, and saving it is the first write.

## Translation

A `translatable: true` global has one content row per locale, and the locale
switcher moves between them. Fields declared `translatable: false` are shared:
they live on the default locale's row and propagate to every other locale, so
writing the logo once sets it everywhere.

Writing a locale that has no row yet creates it, inheriting the shared fields
from the default locale. The new locale starts unpublished, whatever the
default locale's status, unless the write names `status`:

```ts
await app.globals.update({
    key: 'site',
    locale: 'fr',
    data: { fields: { siteName: 'Astromech', footerText: '…' } },
});
```

A global that is not translatable accepts only the default content locale; any
other locale is refused rather than silently written to the wrong row.

`update` takes a patch, as `entries.update` does: an omitted field keeps its
value, and an array or container is replaced whole.

## Versions

Every change to a global's fields snapshots the previous state. List, read and
restore them from the service, or from the versions page in the admin. A
version is addressed by the global's key, the locale and its number, which runs
from 1 per locale:

```ts
const history = await app.globals.versions({ key: 'site', locale: 'en' });
const version = await app.globals.getVersion({ key: 'site', locale: 'en', version: 2 });
version.snapshot.fields; // the fields as they were
await app.globals.restoreVersion({ key: 'site', locale: 'en', version: 2 });
```

`versions` returns newest first, and each item carries only `version`,
`locale`, `createdAt` and `createdBy`. `getVersion` adds `snapshot`, the fields
the version holds. A number the locale has no version for is a 404. Restoring
snapshots the current state first, so a restore is itself undoable.
Declare `versioning: false` to turn history off for a global.

## Publishing and scheduling

With `statuses` on (the default), a global is a draft until it is published.

```ts
await app.globals.publish({ key: 'site', locale: 'en' });
await app.globals.unpublish({ key: 'site', locale: 'en' });
await app.globals.schedule({ key: 'site', publishedAt: new Date('2026-01-01') });
```

`update` takes the same `status` and `publishedAt` an entry update does, so a
save and a publish can be one call:

```ts
await app.globals.update({
    key: 'site',
    data: { fields: { siteName: 'Astromech' }, status: 'published' },
});
```

An `update` that names `status` or `publishedAt` needs `global:<key>:publish`
as well as `global:<key>:update`, whatever the value, as `publish`, `unpublish`
and `schedule` do. A role without `publish` saves by leaving both out.

Each locale publishes independently. Publishing and scheduling check the stored
fields as a publish, since a scheduled global goes live unattended: a `required`
field left empty refuses the call with a 422 naming it. A staged write takes no
status: merge the staged change, then publish.

`publish`, `unpublish` and `schedule` are updates, so they fire
`global:beforeUpdate` and `global:afterUpdate` with the new status in `data`,
as an entry's status change fires `entry:beforeUpdate` and `entry:afterUpdate`.
They write no version and leave the fields as they are.

`publishedAt` follows one rule for globals and entries. A date you pass is
stored as given. Otherwise a global that is already published keeps its date,
through a re-publish or any save, and one becoming published (from a draft or
a schedule) is stamped with the current time, so publishing a scheduled global
puts it live at once.
Unpublishing clears the date, and scheduling keeps the one it names. A write
that leaves a global scheduled with no date is refused with a 422 naming
`publishedAt`. A
scheduled global goes live on the first run of the built-in `scheduled-publish`
job after its date, as a scheduled entry does
([../configuration/scheduler.md](../configuration/scheduler.md)). The job
publishes each row as an update, so the update hooks fire, and it keeps the
scheduled date. The write holds only while the row is still scheduled for the
date the job read: a row unscheduled, rescheduled or deleted meanwhile (by an
editor, or by a `global:beforeUpdate` hook) is skipped, and the skip is logged
at debug level rather than as an error, since the later change wins. A row the job
cannot publish, such as one whose fields have since become incomplete, is
logged as an error and stays scheduled, and the next run tries it again.

## Staged changes

With `staging: true`, a global can carry a prepared future version alongside the
live one:

```ts
await app.globals.createStaged({ key: 'site', locale: 'en' });
await app.globals.update({
    key: 'site',
    locale: 'en',
    staged: true,
    data: { fields: { siteName: 'Astromech CMS' } },
});
await app.globals.mergeStaged({ key: 'site', locale: 'en' });
```

`createStaged` copies the live locale as it stands and takes no field values;
a locale that already has a staged change answers 409 `staged_change_exists`,
also when two calls race. Edit the copy with `update` and `staged: true`, which
validates like any other write. `getStaged` reads it, `deleteStaged` discards it. A staged change is never
published, so reading one needs `full: true` and the read permission.
`getStaged` also answers `diverged: true` when the live version in that locale
was saved after the staged change was made, so a merge would overwrite that
save. Its `updatedAt` and `updatedBy` are the staged change's own last edit; a
staged edit does not move the global's until the merge.

## Permissions

Each global derives its own permissions from its key:

- `global:<key>:read`, `global:<key>:update`, `global:<key>:publish` for a host
  global. `publish` covers the status methods and any `update` that names
  `status` or `publishedAt`.
- `plugin:<namespace>:global:<key>:<action>` for a plugin's.

Grant them with `globalPermissions`:

```ts
import { globalPermissions, permissionsForBuiltInRole } from 'astromech';

roles: {
    'content-editor': {
        name: 'Content Editor',
        permissions: [
            ...permissionsForBuiltInRole('editor'),
            ...globalPermissions('site', 'read', 'update'),
            ...globalPermissions('seo/settings', 'read'),
        ],
    },
}
```

A global is never created or deleted, so there is no permission for either. A
bare `global:*` grant never reaches a plugin's globals, which carry the plugin
prefix.
