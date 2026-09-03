# Media

A **media item** is one uploaded file plus what editors say about it: a title,
alt text, a caption, and any custom fields you declare. The file is one file
whatever the locale; the words about it can be translated, and every change to
them is kept as a version.

## Custom fields

Media takes a `fields` array in the top-level `media` block, and the fields
behave exactly as an entry type's:

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import * as fields from 'astromech/fields';

export default defineConfig({
    media: {
        fields: [
            fields.text('photographer', { label: 'Photographer' }),
            fields.text('copyright', { label: 'Copyright' }),
        ],
    },
});
```

`title`, `alt` and `caption` are built in, so do not declare fields for them.

`media.validate` is a whole-resource validator. It runs on `update`, after
every field has been processed, so it sees the coerced values:

```ts
media: {
    fields: [fields.text('photographer'), fields.text('copyright')],
    validate: async ({ values }) => {
        if (values.copyright && !values.photographer) {
            return { photographer: 'Name the photographer when a copyright is set' };
        }
    },
}
```

## Reading media from your site

```astro
---
import { getAstromech } from 'astromech';

const app = await getAstromech();
const logo = await app.media.get({ id: logoId });
const images = await app.media.query({
    where: { mimeType: 'images' },
    search: 'hero',
    sort: { createdAt: 'desc' },
    limit: 20,
});
---

<img src={logo?.url} alt={logo?.alt ?? ''} />
```

`get` returns `null` for an id that does not exist. `query` returns
`{ data, pagination }`, filters `mimeType` by bucket (`images`, `videos`,
`documents`, `other`), searches on the filename, and sorts by `filename`,
`mimeType`, `size` or `createdAt`.

A `Media` carries:

- The file: `id`, `filename`, `mimeType`, `size`, `width`, `height`,
  `metadata`, and `url`.
- The content: `title`, `alt`, `caption`, `fields`, and the `locale` it was read
  in with the `locales` that have content.
- The stamps: `createdAt`, `createdBy`, plus `updatedAt` and `updatedBy`, which
  are the file's last change and whoever made it. A caption edit does not move
  them; replacing the file does, which is what makes `updatedAt` usable as a
  cache-buster on an image URL.

What `url` points at depends on the access mode: see
[media access modes](../configuration/storage.md#media-access-modes).

## Translation

Turn translation on for media in the config:

```ts
media: {
    translatable: true;
}
```

Every locale in `locales` may then hold its own title, alt text, caption and
fields, and `get`, `query`, `update`, `versions` and `restoreVersion` take a
`locale`:

```ts
const image = await app.media.get({ id, locale: 'fr' });
```

**A read falls back to the default locale.** A locale with no content yet
returns the default locale's words rather than nothing, so a library listing in
`fr` still shows every file. `image.locale` tells you which locale the content
actually came from, and `image.locales` lists the ones that have content:

```ts
image.locale; // 'en': no French content yet
image.locales; // ['en']
```

**The first save to a locale copies the default locale's content.** Writing
`fr` for the first time creates the row from the `en` one and applies your patch
over it, so the untranslated caption stays readable instead of going blank:

```ts
await app.media.update({ id, locale: 'fr', data: { alt: 'Un phare en hiver' } });
```

`update` takes a patch, as `entries.update` does: an omitted key keeps its
value, an explicit `null` stores null, and an array or container is replaced
whole.

A field declared `translatable: false` is shared: it lives on the default
locale's content and propagates to every other locale, so writing it once sets
it everywhere.

```ts
media: {
    translatable: true,
    fields: [fields.text('copyright', { translatable: false })],
}
```

With translation off, only the default content locale is accepted; any other
locale is refused rather than written to the wrong row.

## Versions

Every change to a title, alt text, caption or fields keeps the previous state.
Versions are per locale, always on, and there is no option to turn them off:

```ts
const history = await app.media.versions({ id, locale: 'en' });
await app.media.restoreVersion({ id, locale: 'en', versionId: history[1].id });
```

`versions` returns newest first. Restoring snapshots the current state first, so
a restore is itself undoable. Neither method falls back: they address one
locale's content, and a locale with none is a 404.

Replacing the file writes no version, because a version holds words rather than
bytes. It does change `updatedAt` and `updatedBy`:

```ts
await app.media.replace({ id, file });
```

## The admin

The media library at `/cms/media` opens an item in a detail modal: a preview on
one side, the title, alt text and caption on the other. Custom fields are
written through the API and the SDK; the modal does not render them yet.

With `translatable: true` and more than one locale configured, the modal's form
gains a locale select. Choosing a locale re-reads the item in it; a locale with
no content yet is labelled "Add FR" in the list and shows the default locale's
content until the first save creates the row.

Beneath the form, a versions panel lists that locale's history newest first with
a restore action. It follows the row that was actually read, so an untranslated
locale shows the default locale's versions.

## Permissions

Media has four permissions, and every method is gated by one of them:

| permission     | methods                              |
| -------------- | ------------------------------------ |
| `media:read`   | `query`, `get`, `usedBy`, `versions` |
| `media:upload` | `upload`, `replace`                  |
| `media:update` | `update`, `restoreVersion`           |
| `media:delete` | `delete`                             |

`replace` is an upload rather than an update: it writes new bytes to storage
under the same id.

Grant them in a role like any other permission:

```ts
roles: {
    'photo-editor': {
        name: 'Photo Editor',
        permissions: ['media:read', 'media:upload', 'media:update'],
    },
}
```
