# Rich text

A `richtext` field stores a ProseMirror document as JSON. That JSON is the
canonical value: it's what the editor edits, what validation checks, and what
sits in the database. HTML is what the field converts to and from at the edges.

## Declaring the field

```ts
fields.richtext('body', { label: 'Body' });
```

That gives you everything the editor can do. To narrow it, pass `allow`:

```ts
fields.richtext('summary', {
    label: 'Summary',
    allow: { heading: false, codeBlock: false, horizontalRule: false },
});
```

The keys are `heading`, `bold`, `italic`, `underline`, `strike`, `code`,
`codeBlock`, `link`, `bulletList`, `orderedList`, `blockquote`,
`horizontalRule` and `textAlign`. Every one is on unless you set it to `false`,
and omitting a key leaves it on — you only ever list what you're turning off.

`allow` is not a toolbar setting. Disabling a feature removes its node or mark
from the field's ProseMirror schema, so a document containing one is refused on
write, and pasted content carrying one has it stripped rather than kept and
hidden.

## Reading a rich-text value

Which side of the conversion you get depends on the shape you read.

A **public-shape read** — the default for anything the site renders — gives you
a sanitized HTML string, already rendered from the stored document:

```astro
---
const post = await Astromech.entries.get({ type: 'post', id });
const body = post?.fields.body as string | null;
---

<article set:html={body} />
```

A **full read** gives you the ProseMirror JSON, unrendered:

```ts
const post = await Astromech.entries.get({ type: 'post', id, full: true });
// post.fields.body is a JSONContent document
```

Writes take the JSON. Saving the HTML you got from a public read back onto the
field is refused with `Must be a rich text document, not an HTML string`, so
re-read with `full: true` before you edit and save.

A field marked `private: true` is absent from the public shape entirely, so
there's no rendered HTML to read — see `renderRichText` below.

## `renderRichText` and `parseRichText`

Both ship from the `astromech` barrel, and both run over the same extension set
the editor and the schema use, so nothing can drift between them.

```ts
import { renderRichText, parseRichText } from 'astromech';
```

**`renderRichText(json, allow?)`** turns a document into a sanitized HTML
string. This is what the public shape calls, and you call it yourself when you
hold JSON that the projection didn't render for you — a `private` field, or a
document you built by hand. It strips `javascript:` and `data:` hrefs, inline
event-handler attributes, and everything but `text-align` and `text-wrap` from
inline styles. It returns `''` for `null`, `undefined`, or a document it can't
render.

**`parseRichText(html, allow?)`** is the inverse: an HTML string in, a document
out, ready to write to the field. Anything outside `allow` is dropped by the
schema rather than by hand, and unsafe link schemes are stripped from the
result.

```ts
await Astromech.entries.update({
    type: 'post',
    id,
    data: { fields: { body: parseRichText('<p>Hello <strong>world</strong></p>') } },
});
```

Pass the field's own `allow` list when it has one, or the parse will admit nodes
the field then refuses on write:

```ts
parseRichText(html, { heading: false, codeBlock: false, horizontalRule: false });
```

**`parseRichText` throws on malformed input.** It does not fall back to an empty
document, because it is a write path and an empty document written over an
author's content would be data loss and a silent failure at the same time.
`renderRichText` is the opposite — a read path, where an empty string is a
visible problem that costs nothing — so it swallows and returns `''`. Wrap a
parse in a `try`/`catch` if the HTML comes from somewhere you don't control.

`decisions/0025-html-as-the-rich-text-interchange-format.md` records why HTML is
the format on both sides, and what markdown, raw JSON and text-run segments each
lost on.
