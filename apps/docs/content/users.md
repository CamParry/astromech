# Users

A **user** is an admin account: the `email`, `name` and `role` better-auth
manages, plus any custom fields your site declares. The fields can be
translated, and every change to them is kept as a version.

## Custom fields

Users take a `fields` array in the top-level `users` block, and the fields
behave exactly as an entry type's:

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import * as fields from 'astromech/fields';

export default defineConfig({
    users: {
        fields: [
            fields.text('jobTitle', { label: 'Job title' }),
            fields.text('bio', { label: 'Bio' }),
        ],
    },
});
```

`users.validate` is a whole-resource validator. It runs on `create` and on
`update`, after every field has been processed, so it sees the coerced values:

```ts
users: {
    fields: [fields.text('jobTitle'), fields.text('bio')],
    validate: async ({ values }) => {
        if (values.bio && !values.jobTitle) {
            return { jobTitle: 'Set a job title before writing a bio' };
        }
    },
}
```

## Reading users from your site

```astro
---
import { getAstromech } from 'astromech';

const app = await getAstromech();
const editor = await app.users.get({ id: editorId });
const editors = await app.users.query({
    search: 'jane',
    sort: { name: 'asc' },
    limit: 20,
});
---
```

`get` returns `null` for an id that does not exist. `query` returns
`{ data, pagination }` and sorts by `name`, `email`, `createdAt`, `updatedAt`
or `role`.

A `User` carries:

- The account: `id`, `email`, `name`, `emailVerified`, `image`, and `role`, the
  slug of the user's role resolved against the config.
- The content: `fields`, and the `locale` it was read in with the `locales`
  that have content.
- The stamps: `createdAt`, and `updatedAt`, which is the account row's last
  change (profile, email or role).

## Translation

Turn translation on for users in the config:

```ts
users: {
    translatable: true;
}
```

Every locale in `locales` may then hold its own `fields`, and `get`, `query`
and `update` take a `locale`:

```ts
const editor = await app.users.get({ id, locale: 'fr' });
```

**A read falls back to the default locale.** A locale with no content yet
returns the default locale's fields rather than nothing. `editor.locale` tells
you which locale the content actually came from, and `editor.locales` lists the
ones that have content:

```ts
editor.locale; // 'en': no French content yet
editor.locales; // ['en']
```

**The first save to a locale copies the default locale's fields.** Writing
`fr` for the first time creates the row from the `en` one and applies your
patch over it:

```ts
await app.users.update({ id, locale: 'fr', data: { fields: { bio: 'Rédactrice' } } });
```

`name`, `email` and `role` are the account, not content: they are written
whatever the locale you pass.

A field declared `translatable: false` is shared: it lives on the default
locale's content and propagates to every other locale, so writing it once sets
it everywhere.

```ts
users: {
    translatable: true,
    fields: [fields.text('jobTitle', { translatable: false })],
}
```

With translation off, only the default content locale is accepted; any other
locale is refused rather than written to the wrong row.

## Versions

Every change to `fields` keeps the previous state. Versions are per locale,
always on, and there is no option to turn them off:

```ts
const history = await app.users.versions({ id, locale: 'en' });
await app.users.restoreVersion({ id, locale: 'en', versionId: history[1].id });
```

`versions` returns newest first. Restoring snapshots the current state first,
so a restore is itself undoable. Neither method falls back: they address one
locale's content, and a locale with none is a 404.

A change to `name`, `email` or `role` writes no version, because a version
holds what the site's own fields say, not the account.

## The admin

The user edit page renders the site's declared fields through the same form
blocks the global edit page uses. With `translatable: true` and more than one
locale configured, the page gains a locale select; choosing a locale re-reads
the user in it. Beneath the form, a versions panel lists that locale's history
newest first with a restore action.

## Permissions

Users have four permissions:

| permission     | methods                    |
| -------------- | -------------------------- |
| `users:read`   | `query`, `get`, `versions` |
| `users:create` | `create`                   |
| `users:update` | `update`, `restoreVersion` |
| `users:delete` | `delete`                   |

`get` and `update` have a self-access rule beside the permission: a caller
reading or updating their own user row passes without `users:read` or
`users:update`. `versions` and `restoreVersion` have no such rule and always
need the permission, even for the caller's own row.

Grant them in a role like any other permission:

```ts
roles: {
    editor: {
        name: 'Editor',
        permissions: ['users:read'],
    },
}
```
