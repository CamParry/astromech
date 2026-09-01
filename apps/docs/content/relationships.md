# Relationships

A relationship links one piece of content to another — a post to its author, a
page to its parent, a block to a gallery of images.

## Declaring one

```ts
fields.relationship('author', { target: 'author' });
fields.relationship('tags', { target: 'tag', multiple: true });
fields.relationship('owner', { target: 'users' });
```

`target` names the entry type being pointed at, or the literal `'users'` to
point at a user. `multiple: true` stores a list instead of a single id. A
`media` field is a relation too, and is indexed like one — you do not declare
it differently.

There is no `inverse`, no `ordered` and no `onDelete`. Order is array position
in the field data, which is the only place it lives. The reverse direction is
queried, not declared — see below.

Relationship fields nest. One inside a `group`, `repeater`, `blocks` or `tree`
works at any depth and needs no special handling.

## The value is ids

A relationship field reads back as the id (or ids) you stored. Astromech does
not expand it into the whole related entry — resolving an id into content is a
second read that you make when you need it.

Writing an expanded record back is refused rather than silently accepted:
`relationship` and `media` reject an entry object where an id belongs —
`Must be an id, not a populated record`, or `Must be a list of ids, not a
populated record` on a `multiple` field. A `public`-shape read is a projection,
so re-read with `full: true` before saving.

## Relations and locales

A relation stores an entry id, and an entry has one id in every locale. Adding a
translation changes nothing about the relations pointing at it, and no relation
has to be re-pointed when one locale is edited.

Because the id names the entry and not one locale of it, reading the related
content is a second `get` with the locale you want:

```ts
const page = await Astromech.entries.get({ type: 'page', id, locale: 'fr' });
const author = await Astromech.entries.get({
    type: 'author',
    id: page.fields.author as string,
    locale: 'fr',
});
```

`get` does not fall back: a locale the target has no content for returns `null`,
and it is yours to decide what to show instead.

`where: { references }` compares entry ids too, so it answers for the entry
across every locale. `incomingRelationships` returns entry ids in `sourceId`,
one row per edge, with `sourceTitle` read in the default locale.

## Querying the reverse direction

To find the content pointing _at_ something, filter on `references`:

```ts
// Every post whose `author` field names this author
await Astromech.entries.query({
    type: 'post',
    where: { references: { path: 'author', id: authorId } },
});

// A relation nested inside a repeater — the path is the schema path
await Astromech.entries.query({
    type: 'page',
    where: { references: { path: 'sections[].gallery', id: mediaId } },
});
```

The `path` is a **schema path**: `sections[].gallery`, with empty brackets for
"any item". It is validated against the schemas of the types you are querying
and throws when it names nothing, so a typo fails loudly instead of returning
an empty page. A type stored in its own table rather than in `entries` refuses
this filter.

For the delete-confirmation case there is a direct call:

```ts
await Astromech.entries.incomingRelationships({ type: 'post', id });
// → [{ sourceId, sourceTitle, sourceType, schemaPath }]
```

## How it is stored, and what you owe it

Field data is the source of truth. The `relationships` table is a **derived
index** over that data, rebuilt from it rather than authored alongside it, and
read for exactly three things: reverse lookup, the `references` filter, and
delete-time information. A forward read never touches it.

The consequence worth knowing: **the index is a function of your schema and
your data, so changing the schema does not update it.** Adding a relationship
field to an existing container leaves every existing row missing those edges.
Nothing repairs this at startup — that would be expensive, surprising, and
would paper over the drift instead of reporting it. Rebuild explicitly:

```sh
astromech index:rebuild            # regenerate from field data
astromech index:rebuild --check    # report drift, write nothing, exit 1 if any
```

`--check` is the form to run in CI. See [../cli.md](../cli.md).

Because the index is derived, a wrong index is repairable and a rebuild is
always safe. That is what makes it acceptable for it to be polymorphic across
entries, users and media.

## Deleted targets

An id whose target no longer exists is dropped from the field data the next
time the entry is written, and the index row goes with it. The check is
deliberately timid, because a false positive deletes an author's data — an id
is **kept** when the field names no target, when the target names no configured
entry type, and when the target type is stored in its own table (its rows are
not in `entries`, so every one of them would look absent).

That last case has a consequence: relations pointing at a custom-table type
accumulate dangling ids until you run `index:rebuild`.

## Further reading

Why it is built this way — and the alternatives rejected, including declared
reverse fields, `onDelete` cascades, and filtering into a target's own fields —
is recorded in `DECISIONS.md`.
