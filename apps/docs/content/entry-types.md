# Declaring entry types

An **entry type** is the shape of a kind of content — its fields, its
capabilities (statuses, slugs, translations, versioning, trash), its admin
columns, and its front-end URL template. It is not a piece of content; entries
are the rows you create against it.

Entry types are declared in the `entries` array of your config, each naming its
own `type`:

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import * as fields from 'astromech/fields';

export default defineConfig({
    entries: [
        {
            type: 'tag',
            single: 'Tag',
            plural: 'Tags',
            icon: 'Tag',
            url: '/blog/tag/{slug}',
            fields: [fields.color('color', { label: 'Color' })],
        },
    ],
});
```

The `type` (`tag`) is the type name — it is what `Astromech.entries.query({
type: 'tag' })`, the admin route `/cms/entries/tag`, and the generated
`Fields` types all use. Each `type` is unique within the array and may not
contain `/` or `:`; Astromech refuses to start otherwise. A plugin's entry
types take the same shape in the plugin definition's `entries` array, and are
addressed as `<namespace>/<type>` — see
[plugins/authoring.md](../plugins/authoring.md).

The field builders, and how grouping and layout fields decide where values are
stored, are in [fields.md](fields.md).

## Sorting a list

`Astromech.entries.query()` takes `sort` as `{ key: 'asc' | 'desc' }`, or a
list of them for a tiebreak. A key is one of the entry's own columns (`title`,
`status`, `slug`, `createdAt`, `updatedAt`, `publishedAt`) or the name of a
top-level field that holds one value: `text`, `textarea`, `number`, `range`,
`boolean`, `date`, `datetime`, `select`, `radio-group`, `email`, `url`, `color`
or `slug`. Over the REST API it travels as `?sort=price&dir=asc`.

```ts
const { data } = await Astromech.entries.query({
    type: 'product',
    sort: { price: 'asc' },
});
```

- A number field sorts by value, a date field by date (while its values share
  one format), and a boolean as `false` then `true`.
- An entry with no value sorts first ascending and last descending.
- Entries with equal values keep one order from page to page: newest first.
- A query over several types sorts by a field only when every type declares it.
- A public read cannot sort by a `private` field.
- A field named like one of the entry's columns (a `title` field, say) cannot be
  sorted by: the key sorts by the column.

Any other key answers 400 `UnknownSortKeyError`, whose message lists the keys
that would work.

An admin column marked `sortable` lets an editor sort the list by that field:

```ts
import * as columns from 'astromech/columns';

adminColumns: [columns.number('price', { sortable: true })],
```

Config loading fails when a `sortable` column names a field the list cannot
sort by, so the admin never offers a sort the API refuses.

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

An update that names a locale the entry has no row in yet adds that locale. The
new row takes the default locale's title, slug and shared fields, and starts
`unpublished` with no publish date, whatever the default locale's status. To
publish or schedule it in the same call, name `status` (and `publishedAt`) in
`data`, which needs the type's `publish` permission.

`Astromech.entries.duplicate()` copies an entry into a new one, `unpublished`
unless `overrides` names a `status`. A write that leaves an entry scheduled with
no date is refused with a 422 naming `publishedAt`.

## Trash and restore

`Astromech.entries.trash()` moves an entry to the trash with every locale, and
`restore()` brings it back. A trashed entry gives up its slug: a new entry
titled "Same" takes `same` even while an older "Same" is in the trash.
A trashed entry is read-only until it is restored: an update, a status change,
a new locale, a new staged change, a staged merge, a version restore or a
preview token answers 409 `CONFLICT` with `details.reason` `trashed` and the
entry's `details.id`, including when the entry is trashed while the write runs.
Restoring sets every locale `unpublished`, through the same update path as any
status change, so the update hooks fire. A locale whose
slug another entry took meanwhile gets the next free one (`same-2`). An entry
that another call restores while the restore runs is left as that call left it.
The admin's restore message says the entry is unpublished and names any new
slug. Emptying the trash deletes its entries for good.

## Splitting a type into its own module

Entry types are the part of a config that grows without bound. Once one has
enough fields that it dominates the file, move it out with `defineEntryType`:

```ts
// src/entries/author.ts
import { defineEntryType } from 'astromech';
import * as fields from 'astromech/fields';

export const author = defineEntryType({
    type: 'author',
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
    entries: [
        author,
        {
            type: 'tag',
            /* ... */
        },
    ],
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
