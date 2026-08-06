# Field validation

Every write to an entry, a media record, a user or a settings group runs its
values through one pipeline: **coerce → default → validate**. The same pipeline
runs in the browser before a submit, so an author sees a bad value the moment
they leave the field rather than after a round trip.

This page covers what you can declare, when each check runs, and what reaches
the browser.

## Completeness and correctness

Validation answers two different questions, and they do not run at the same
time.

**Completeness — "is this finished?"** The `required` flag, and a container's
minimum item count. These run **only when the entry is being published**. A
draft is allowed to be half-typed; that is what a draft is for.

**Correctness — "is what you typed valid?"** Everything else: `url`, `email`,
`pattern`, `enum`, length bounds, a container's maximum item count, malformed
JSON, `unique`, `custom`. These run on **every** write, drafts included.
Storing a malformed URL is a data-integrity problem, not an incomplete one.

```ts
fields.text('customer', { label: 'Customer', required: true }),
fields.url('website', { label: 'Website' }),
```

Save that entry as a draft with `customer` empty and it saves. Put `not a url`
in `website` and it is refused, draft or not. Publish it with `customer` still
empty and publishing is refused.

The stage is derived from the status the row will hold _after_ the write, so
scheduling counts as publishing — a scheduled entry goes live unattended and
must be complete. An entry type with `statuses: false` has no draft concept at
all, so it always validates as a publish.

Media, users and settings have no draft concept either, so they always run both
halves.

## Declaring rules

`required`, and `min`/`max` on a container, are properties of the field:

```ts
fields.repeater('features', {
    label: 'Features',
    min: 2,          // completeness — publish only
    max: 6,          // correctness — every write
    fields: [fields.text('title', { required: true })],
}),
```

> On a container, `min` and `max` are **item counts**. In a `validation` rule
> they are **numeric bounds** on a number field. Same words, different things.

Everything else goes in `validation`:

```ts
fields.text('handle', {
    label: 'Handle',
    validation: [
        { minLength: 3 },
        { maxLength: 30 },
        { pattern: '^[a-z0-9_]+$', message: 'Lowercase letters, digits and underscores only' },
        { unique: true },
    ],
}),
```

The available rules are `minLength`, `maxLength`, `min`, `max`, `pattern`
(with an optional `message`), `email`, `url`, `enum`, `unique` and `custom`.

There is deliberately no `{ required: true }` rule — required-ness is the
`required` flag, declared in exactly one place.

## One message per field

A field reports **at most one** error. The checks short-circuit in a fixed
order:

1. `required` (publish only)
2. container item counts — `min` (publish only), then `max`
3. the field type's own validator
4. your `validation` rules, in the order you declared them

The type's own validator runs **before** your rules on purpose. A rule like
"must be on example.com" cannot be judged against a value that is not even a
URL, so reporting it first would send the author chasing the wrong problem.
A malformed URL reports `Must be a valid URL`, and only once that is fixed does
your rule get a say.

## What each field type checks

Most types bring their own validator, and it runs on every write whether or not
you declared any rules. This matters more than it looks: the declarative rules
all ignore a value of the wrong type — `minLength` only measures strings and
arrays, `min` only compares numbers — so on a wrong-typed value the type's own
validator is the only thing standing between the input and storage.

| Field type                      | What it rejects                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `richtext`                      | Anything that is not a rich-text document the field's `allow` list admits — including an HTML string |
| `select`, `radio-group`         | A value that is not one of the declared `options`                                                    |
| `multiselect`, `checkbox-group` | A non-list, or a list holding an undeclared option                                                   |
| `number`, `range`               | A non-number (a numeric string is parsed first), `NaN`, `Infinity`                                   |
| `boolean`                       | Anything that is not `true` or `false`                                                               |
| `date`, `datetime`              | A string that does not parse as a date (a `Date` is converted first)                                 |
| `media`, `relationship`         | Anything that is not an id, or a list of ids when `multiple`                                         |
| `email`, `url`                  | A malformed address or URL                                                                           |
| `json`                          | A value that is not JSON-serializable                                                                |
| `key-value`                     | Anything that is not an object of key/value pairs                                                    |
| `blocks`                        | An item whose `_type` matches no declared block                                                      |

A field that declares no `options` has nothing to check against, so `select`
and the other choice types accept any string. `slug` normalizes its value
rather than rejecting one. `text`, `textarea`, `color`, `link` and the
`group`/`repeater`/`tree` containers are checked for **shape** but not for
format — a `color` must be a string, and a `link` must be an object with a
`url` key, but neither is checked against a colour or URL grammar. Declare
`pattern` or a `custom` rule where the format matters.

Two checks are deliberately **not** made. A `relationship` or `media` value is
checked for being an id, but nothing confirms the id resolves to a record, or
that the record is the `target` type. And a stored value is only validated when
it is written — a field whose rules tighten later does not retroactively
invalidate rows already in the database.

### Writing back what you read

A `public`-shape read is a projection, not a round-trippable record: private
fields are stripped and rich text is rendered to HTML. Writing one straight back
is refused rather than silently accepted — `richtext` rejects the rendered
string, and `relationship`/`media` reject a populated record from an expanded
read.

Re-read with `full: true` before saving. The projection cannot always tell:
a public read that dropped a private **text** field looks exactly like a
deliberate clear, so treat a public read as display data and nothing else.

## Warnings

A rule can be advisory instead of blocking:

```ts
fields.text('title', {
    label: 'Title',
    validation: [
        { maxLength: 60, severity: 'warning' }, // flagged, still saves
        { maxLength: 200 }, // blocks
    ],
}),
```

`severity` defaults to `'error'`. A `'warning'` shows in the editor and the
write goes through — it never reaches the 422.

A field reports at most one error **and** at most one warning, each the first of
its kind in declaration order. An error supersedes a warning in the UI: they are
never shown together, and the warning reappears once the error is fixed.

Three things are always errors and cannot be softened: `required`, a container's
`min`/`max` item counts, and a field type's own validator. Completeness and type
validity are not matters of taste.

> Warnings are an **editor** feature. The server does not evaluate them at all —
> not "evaluates and discards", genuinely skips. A rule that needs a database
> read costs nothing when nobody is looking at it. The practical consequence is
> that `{ unique: true, severity: 'warning' }` never fires, because the browser
> has no way to answer it.

## Custom validators

`custom` is an imperative validator. It is async, it receives the full
validation context, and it returns `true` or the message to show:

```ts
fields.text('sku', {
    label: 'SKU',
    validation: [
        {
            custom: async (ctx) => {
                if (typeof ctx.value !== 'string') return true;
                const taken = !(await ctx.reads.isUnique(ctx.field, ctx.value));
                return taken ? 'That SKU is already in use' : true;
            },
        },
    ],
}),
```

The context carries `value`, `values` (the field's siblings, for cross-field
rules), `field`, `path`, `operation` (`'create'` or `'update'`), `stage`
(`'save'` or `'publish'`, so a rule can relax itself on a draft), `host`,
`user`, and `reads` for database lookups.

`values` is scoped to the field's own container, not the whole record — a rule
on a field inside a repeater item sees that item's siblings.

> **Known limitation.** `custom` does not currently run under `astro dev` or
> `astro build`. The server's config is serialized to JSON before it reaches the
> running server, which turns `{ custom: fn }` into an empty rule — silently. It
> does work through the CLI. Until that is fixed, do not rely on `custom` as a
> data-integrity guarantee. See `roadmap/planned/config-functions-reach-the-server.md`.

## Whole-resource validation

Some rules belong to no single field — "an event's end date must follow its
start", "supply at least one contact method". Declare a `validate` on the entry
type (or on `media`, `users`, or a settings page):

```ts
entries: {
    event: {
        single: 'Event',
        plural: 'Events',
        fields: [...],
        validate: async ({ values }) => {
            if (values.startsAt > values.endsAt) {
                return { endsAt: 'Must be after the start date' };
            }
            if (!values.email && !values.phone) {
                return 'Provide either an email address or a phone number';
            }
            return null;
        },
    },
},
```

Return an **object** to attach messages to fields by path — the same
`_id`-segmented paths described below, so a nested field works too. Return a
**string** for a form-level message that belongs to the resource as a whole;
those render in an alert above the form rather than against a field. Return
`null` or `undefined` when there is nothing to report.

Every path must return explicitly, as with `custom`'s `return true`. A body that
just falls off the end is a `void` return and will not type-check.

It runs after every field, over the coerced values, and it runs **whether or not
the fields reported** — so one submit surfaces cross-field and per-field problems
together instead of one round at a time. Those values may therefore have failed
their own validation; guard accordingly. If a field already reported an error on
a key you also target, the field's own message wins.

Like `custom`, it is a function and so server-only — it never runs in the
browser.

## What runs in the browser

The admin runs the same pipeline over the same field definitions. There is no
second rule engine to keep in sync: a new rule, a new field type or a changed
message appears in the browser the moment it appears on the server.

What the browser skips is decided by **data-dependence**, not by whether a
check is declarative:

- **`unique`** needs a database read the browser cannot make. Skipped in
  silence — no "checking…" state. The server runs it on submit.
- **`custom`** and the resource-level **`validate`** are functions. The admin
  config is serialized as JSON to reach the browser, which strips them.
  Server-only, and not by choice.
- **Everything else runs**, including the type-intrinsic validators like `url`
  and `email`. Those are imperative but pure, and they are the checks an author
  trips over most.
- **Warnings run here and only here.** They are advisory, so the server has no
  use for them.

The server remains authoritative. Client-side validation is a faster answer to
the same question, never the only answer.

### When an error appears

- **On blur, but only if the field is dirty.** Tabbing through a form to survey
  it never turns anything red. `required` cannot fire here by construction: the
  field is empty, so it is not dirty, and blur validates at the draft stage
  anyway.
- **On every keystroke, once a field is already showing an error**, so a
  corrected value clears the moment it is fixed rather than on the next blur.
- **On submit, everything** — at the stage the outgoing status implies.

A refused submit does not reach the network. Errors appear inline on the
fields, and a toast names them:
`Please fix Customer, Content → Body.`

## Errors on nested fields

Errors are keyed by a path that addresses container items by their persisted
`_id`, never by array index — an index would shift if an item moved between
form load and save:

```
customer
socials[01H8X…].url
content[01H8Y…].body
```

Over HTTP a failed write is a `422` whose body carries `details.fields`, that
same map of path to messages:

```json
{
    "error": {
        "id": "err_…",
        "code": "VALIDATION_FAILED",
        "message": "Validation failed",
        "status": 422,
        "details": {
            "fields": {
                "socials[01H8X4QK7V].url": ["Must be a valid URL"]
            }
        }
    }
}
```

The map's values are arrays because that is the wire shape, but the pipeline
short-circuits, so each one carries a single message.

A resource-level message travels alongside them as `details.form`, an array of
strings. The key is omitted entirely when there are none, so a response with
only field errors looks exactly as it always has.

## Accessibility

A field's error is associated with its control through `aria-invalid` and
`aria-describedby`, present for as long as the error is. A **warning** sets
`aria-describedby` but deliberately not `aria-invalid` — the value is not
invalid, and marking it so would misreport the field to a screen reader. It is deliberately
**not** a live region: an assertive one clips the name of the field the author
just tabbed to, and a polite one reads the previous field's error after the new
field's name. Announcement is left to the submit-time toast, where one message
describes the whole form.

A plugin's custom field type gets this for free as long as it builds on the
`astromech/ui` atoms — `Input`, `Textarea`, `Select`, `MultiSelect`, `Checkbox`,
`RadioGroup`, `Toggle`, `ColorPicker` and `RichTextEditor` all read the
enclosing field's error state and apply the association themselves. (`Slider` is
the exception: the underlying library forwards `aria-describedby` to the input
that takes focus but not `aria-invalid`, so it carries the message without the
invalid state.)

A field type that renders its own control reads the same state through
`useFieldControl` and spreads the ARIA it returns:

```tsx
import { useFieldControl } from 'astromech/ui/fields';

function StarRatingField({ value, onChange }: BaseFieldProps) {
    const { hasError, ariaProps } = useFieldControl();
    return (
        <div
            role="slider"
            tabIndex={0}
            aria-valuenow={Number(value ?? 0)}
            className={hasError ? 'is-invalid' : undefined}
            {...ariaProps}
        />
    );
}
```

`ariaProps` is `aria-invalid` plus `aria-describedby` pointing at the message
`FieldWrapper` rendered, and is empty when the field has no error — so the same
component is safe to render outside a field wrapper.
