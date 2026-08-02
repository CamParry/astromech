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

Field types that bring their own validator: `url`, `email`, `json`,
`key-value`, and `blocks` (which rejects an undeclared block type). `slug`
normalizes its value but does not reject one.

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

## What runs in the browser

The admin runs the same pipeline over the same field definitions. There is no
second rule engine to keep in sync: a new rule, a new field type or a changed
message appears in the browser the moment it appears on the server.

What the browser skips is decided by **data-dependence**, not by whether a
check is declarative:

- **`unique`** needs a database read the browser cannot make. Skipped in
  silence — no "checking…" state. The server runs it on submit.
- **`custom`** is a function. The admin config is serialized as JSON to reach
  the browser, which strips it. Server-only, and not by choice.
- **Everything else runs**, including the type-intrinsic validators like `url`
  and `email`. Those are imperative but pure, and they are the checks an author
  trips over most.

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

## Accessibility

A field's error is associated with its control through `aria-invalid` and
`aria-describedby`, present for as long as the error is. It is deliberately
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
