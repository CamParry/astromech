# Declaring entry types

An **entry type** is the shape of a kind of content — its fields, its
capabilities (statuses, slugs, translations, versioning, trash), its admin
columns, and its front-end URL template. It is not a piece of content; entries
are the rows you create against it.

Entry types are declared in the `entries` record of your config, keyed by the
type name:

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import * as fields from 'astromech/fields';

export default defineConfig({
    entries: {
        tag: {
            single: 'Tag',
            plural: 'Tags',
            icon: 'Tag',
            url: '/blog/tag/{slug}',
            fields: [fields.color('color', { label: 'Color' })],
        },
    },
});
```

The record key (`tag`) is the type name — it is what `Astromech.entries.query({
type: 'tag' })`, the admin route `/cms/entries/tag`, and the generated
`Fields` types all use. Root-config entry types therefore leave the `type`
property unset. (A plugin's entry types are the exception: they live in an
array on the plugin definition, so each one self-declares `type` — see
[plugins/authoring.md](../plugins/authoring.md).)

## Updating entries

`Astromech.entries.update()` takes a **patch**, not a replacement. A field the
patch omits keeps its stored value; an explicit `null` stores null; an array or
container value — a repeater, a blocks list, a tree — replaces what was there
wholesale rather than merging item by item. Validation runs against the merged
result, so a one-field patch is never failed for a `required` field it did not
mention. Keys left behind by a field you have since removed from the type are
dropped on the next write.

```ts
// `body` and every other field keep their current values.
await Astromech.entries.update({
    type: 'author',
    id,
    data: { fields: { role: 'Editor' } },
});
```

The same applies to `Astromech.users.update()` and `Astromech.media.update()`.

## Splitting a type into its own module

Entry types are the part of a config that grows without bound. Once one has
enough fields that it dominates the file, move it out with `defineEntryType`:

```ts
// src/entries/author.ts
import { defineEntryType } from 'astromech';
import * as fields from 'astromech/fields';

export const author = defineEntryType({
    single: 'Author',
    plural: 'Authors',
    icon: 'UserRound',
    translatable: true,
    url: '/authors/{slug}',
    fields: {
        main: [
            fields.richtext('bio', { label: 'Bio' }),
            fields.text('role', { label: 'Role' }),
        ],
        sidebar: [fields.media('avatar', { label: 'Avatar', translatable: false })],
    },
});
```

```ts
// astromech.config.ts
import { author } from './src/entries/author.js';

export default defineConfig({
    entries: {
        author,
        tag: {
            /* ... */
        },
    },
});
```

`defineEntryType` is an identity function — it returns what you give it. What
it buys you is **checking at the point of the mistake**. `defineConfig` only
type-checks what is written inside the call, so a plain object exported from
another module is unconstrained until it is placed in `entries`, and any error
is reported against the config file rather than against the line that is wrong.
Wrapping the export restores that, and gives the module's reader the type's
name up front.

Both forms are equally supported, and mixing them is fine — the demo app
declares `author` in its own module and everything else inline. Declaring a
type inline stays the right default for small ones; reach for the separate
module when the file stops being readable.

Naming: it defines an entry **type**, not an entry. There is no
`defineEntry` — creating content is `Astromech.entries.create()`.
