# Fields

A reference of the field builders in `astromech/fields`: the options every
field takes, each field type, and how grouping and layout fields decide where
values are stored. Validation rules are in
[field-validation.md](field-validation.md).

```ts
import * as fields from 'astromech/fields';

fields.text('title', { label: 'Title', required: true });
```

A field builder takes the field's name first and its options second. **A name
is always a data key**: the value is stored under it, and a structural field
given a name stores its fields under that name too.

## Options every data field takes

| Option         | Meaning                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `label`        | The label in the admin. A string, or `t('key')` for a translated one. Defaults to the name, title-cased.                                   |
| `description`  | Help text under the label.                                                                                                                 |
| `required`     | The field must have a value before an entry is published.                                                                                  |
| `defaultValue` | The value a new entry starts with.                                                                                                         |
| `validation`   | Rules checked on every write. See [field-validation.md](field-validation.md).                                                              |
| `private`      | Leave the field out of public reads and the public type.                                                                                   |
| `translatable` | `false` shares one value across every locale. Top-level fields only: a field inside a named group, repeater, blocks or tree cannot set it. |
| `searchable`   | Add the field to the entry type's free-text search. Top-level fields only, as for `translatable`.                                          |

## Data fields

| Builder                                    | Stores                                    | Its own options                                                    |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------ |
| `text(name)`, `textarea(name)`             | a string                                  | `maxLength`, `count` (a character counter, with an optional range) |
| `richtext(name)`                           | ProseMirror JSON                          | `allow`. See [rich-text.md](rich-text.md)                          |
| `email(name)`, `url(name)`, `slug(name)`   | a string                                  |                                                                    |
| `color(name)`                              | a colour string (hex, `rgb()` or `hsl()`) |                                                                    |
| `date(name)`, `datetime(name)`             | an ISO date string                        |                                                                    |
| `number(name)`, `range(name)`              | a number                                  | `min`, `max`, `step`                                               |
| `boolean(name)`                            | `true` or `false`                         |                                                                    |
| `select(name)`, `radioGroup(name)`         | one option value                          | `options`                                                          |
| `multiselect(name)`, `checkboxGroup(name)` | a list of option values                   | `options`                                                          |
| `link(name)`                               | `{ url, label, target? }`                 |                                                                    |
| `keyValue(name)`                           | an object of strings                      |                                                                    |
| `json(name)`                               | any JSON value                            |                                                                    |
| `media(name)`                              | a media id, or a list                     | `multiple`, `accept`                                               |
| `relationship(name)`                       | an id, or a list of ids                   | `target`, `multiple`. See [relationships.md](relationships.md)     |

## Nested fields

A nested field stores one value under its name, and its fields store inside
that value.

| Builder                      | Stores                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `group(name, { fields })`    | an object of its fields. `boxed: false` draws no box around them.            |
| `repeater(name, { fields })` | a list of objects, each holding its fields. `min` and `max` count the items. |
| `blocks(name, { blocks })`   | a list of objects, each one of the `block(type, { fields })` types listed.   |
| `tree(name, { fields })`     | a nested list of objects. `maxDepth` limits how deep it goes.                |

## Grouping and layout

`group`, `accordion` and `tab` each come in two forms. Given a name, the field
stores its fields under that name. Without one, it is a layout field: it only
draws a surface, and its fields store as if it were not there. `tabs` holds
`tab` fields and never takes a name. With `fields` holding `text('title')`:

| You write                                           | Admin shows           | `title` is stored at |
| --------------------------------------------------- | --------------------- | -------------------- |
| `group('seo', { fields })`                          | a titled box          | `seo.title`          |
| `group('seo', { boxed: false, fields })`            | the fields, no box    | `seo.title`          |
| `group({ label: 'SEO', fields })`                   | a titled box          | `title`              |
| `accordion('seo', { fields })`                      | a collapsible section | `seo.title`          |
| `accordion({ label: 'SEO', fields })`               | a collapsible section | `title`              |
| `tabs({ fields: [tab('seo', { fields })] })`        | a tab                 | `seo.title`          |
| `tabs({ fields: [tab({ label: 'SEO', fields })] })` | a tab                 | `title`              |

An unnamed `accordion` or `tab` needs a `label`, since it has no name to derive
one from. An unnamed group with `boxed: false` would do nothing, so it is
rejected when the config loads, as is `tabs` inside a repeater, blocks or tree.

`private` on a layout field makes every field inside it private:

```ts
fields.group({
    label: 'Internal notes',
    private: true,
    fields: [fields.textarea('notes'), fields.text('reviewer')],
});
```

On a site, `notes` and `reviewer` are stored at the top level and left out of
public reads.
