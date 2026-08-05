# Rich-text write validation accepts an executable link scheme

`checkRichTextDocument` in `packages/astromech/src/fields/rich-text/validate.ts`
builds the document with `Node.fromJSON` and calls `check()`. Neither runs the
Link extension's `parseHTML` URI validation — that only fires when parsing a DOM.
So a document posted straight to the API with

```json
{
    "type": "text",
    "text": "click",
    "marks": [{ "type": "link", "attrs": { "href": "javascript:alert(1)" } }]
}
```

validates as `true` and is stored with the scheme intact. Verified, not inferred.

## How far it actually reaches

Every render path already neuters it. `renderRichText` emits `<a href="">` —
the Link extension's `renderHTML` validates too, and `sanitize()` would catch
whatever got past it. The editor round-trips through the same extension.

What is left is a consumer that takes a **full-shape read** and renders the
ProseMirror JSON with its own renderer. That consumer receives the raw href.
Narrow, but it is the one shape the field's own defences do not cover.

## What to do

Run the same scheme test the write path already has a home for.
`fields/rich-text/safe-links.ts` holds `stripUnsafeLinks`, written for
`parseRichText` and agreeing with `sanitize()` in `fields/rich-text/index.ts`.
The question is whether validation should **reject** the document (naming the
offending href, consistent with how `checkRichTextDocument` surfaces ProseMirror's
own reasons) or **strip** the mark and store the rest.

Rejecting is the better fit: `coerceRichText` is the only place in this field
that rewrites a value, and it does so for one narrow case. Silently dropping a
mark on write is the kind of change an author cannot see happening.

Whichever is chosen, the scheme test must live in exactly one place. Three copies
of "is this href dangerous" is how one of them drifts.

## Why it is not fixed here

It predates the AI capability work and changing what validation rejects has its
own blast radius. `parseRichText` does not widen it: tiptap's Link extension
drops these schemes at parse time before the document is built.
