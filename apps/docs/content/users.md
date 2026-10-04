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

`users.validate` is a whole-resource validator. It runs on `create`, on
`update` and on first-run setup, after every field has been processed, so it
sees the coerced values:

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

## The first admin

First-run setup creates the first admin the way `create` creates a user: a
field's `defaultValue` fills an absent value, a `required` field with no value
refuses the setup, and `users.validate` runs. When a required user field has
no default, or the server refuses one with a check the browser cannot run,
the admin's setup screen shows the user fields beside the name, email and
password, so the first admin can fill them in. It leaves out an optional
`media` or `relationship` field, which takes its default.

A required `media` or `relationship` field with no default cannot be filled in
there: its picker reads the API, which needs a signed-in user. The setup screen
names the field instead. Give it a `defaultValue`, or create the first admin
from the command line with its value:

```sh
astromech users:create --name Ada --email ada@example.com --fields '{"avatar":"<media id>"}'
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
- The stamps: `createdAt`, and `updatedAt`, which is the user's last change:
  to the name, email or role, or to the content in any locale.

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
const version = await app.users.getVersion({ id, locale: 'en', version: 2 });
version.snapshot.fields; // the fields as they were
await app.users.restoreVersion({ id, locale: 'en', version: 2 });
```

A version is addressed by the user's id, the locale and its number, which runs
from 1 per locale. `versions` returns newest first, and each item carries only
`version`, `locale`, `createdAt` and `createdBy`. `getVersion` adds `snapshot`,
the fields the version holds. Restoring snapshots the current state first, so a
restore is itself undoable. None of the three falls back: they address one
locale's content, and a locale with none, or a number it has no version for,
is a 404.

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

| permission     | methods                                  |
| -------------- | ---------------------------------------- |
| `users:read`   | `query`, `get`, `versions`, `getVersion` |
| `users:create` | `create`                                 |
| `users:update` | `update`, `restoreVersion`               |
| `users:delete` | `delete`                                 |

`get` and `update` have a self-access rule beside the permission: a caller
reading or updating their own user row passes without `users:read` or
`users:update`. The rule covers `name` and `fields` only. A change to the
caller's own `role` or `email` still needs `users:update`, and without it
`PUT /api/users/:id` answers 403 `FORBIDDEN`: a stolen session could otherwise
change the email and then reset the password. The version methods have no such
rule and always need the permission, even for the caller's own row.

The rule belongs to the REST route. The same method called through the RPC
route, MCP or a plugin's scoped handle always needs `users:update`. Better
Auth's own `/api/auth/change-email` route is turned off, and its
`/api/auth/update-user` refuses an email.

`create` takes an optional `password` of at least eight characters, and with
one writes the credential account the user signs in with; without one the user
sets a password through the reset link. Outside development a site with no
`email` driver has no way to deliver that link, so give a password on create.

The reset link goes out through the config's `email` driver. With no driver,
Astromech logs the link instead when `NODE_ENV` is `development`. Anywhere
else it logs only that the email was not sent, because the link lets anyone who
opens it set the user's password, and anyone who can read the logs could use it.

A new password signs out the sessions the old one opened. A reset through the
link revokes every session the user had. A change through Better Auth's
`/api/auth/change-password` revokes every session but the caller's, whether or
not the request sets `revokeOtherSessions`, and its response carries the
caller's new session cookie.

`update` and `delete` refuse to take the `admin` role from the only user
holding it, whether the call comes from the admin, the CLI, MCP or a plugin.
The refusal answers 409 `CONFLICT` with `details.reason` `last-admin`. The
write itself repeats the check, so two calls that each demote or delete one
of two admins cannot both succeed.

Grant them in a role like any other permission:

```ts
roles: {
    editor: {
        name: 'Editor',
        permissions: ['users:read'],
    },
}
```
