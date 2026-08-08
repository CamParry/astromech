# Rich-Text Write Validation Accepts an Executable Link Scheme

Reported earlier as a defect against the AI capability work, fixed 2026-08-08 in
`3d38a6a`. Verified, not inferred: the document below validated as `true` and was
stored with the scheme intact.

## What was wrong

`checkRichTextDocument` built the document with `Node.fromJSON` and called
`check()`. Neither runs the Link extension's `parseHTML` URI validation — that
only fires when parsing a DOM. So a document posted straight to the API with

```json
{
    "type": "text",
    "text": "click",
    "marks": [{ "type": "link", "attrs": { "href": "javascript:alert(1)" } }]
}
```

passed validation untouched.

## How far it reached

Every render path already neutered it. `renderRichText` sanitizes on the way out,
the Link extension's `renderHTML` validates too, and the editor round-trips
through the same extension. `parseRichText` never produced one either — tiptap
drops these schemes at parse time, before the document is built.

What was exposed is a consumer taking a **full-shape read** and rendering the
ProseMirror JSON with its own renderer. That consumer received the raw href.
Narrow, but the one shape the field's own defences did not cover.

## As built

`checkRichTextDocument` now walks the value for a link mark whose href resolves
to an executable scheme and rejects, naming the offending href.

- **Reject, not strip.** `coerceRichText` is the only path in this field that
  rewrites a value, and it does so for one narrow case. Silently dropping a mark
  on write is a change the author cannot see happening; a rejection they can.
- **The check runs after `check()`**, so ProseMirror's own structural reasons
  still come first. A document that is both malformed and carrying an unsafe link
  reports the malformation, which is the more useful reason of the two.
- **The echoed href is capped at 80 characters** with a trailing ellipsis, so a
  base64 `data:` URI cannot turn an error message into a multi-kilobyte payload.

The scheme test itself had two copies before this — a private `isUnsafeLink` in
`fields/rich-text/safe-links.ts` and an inline duplicate inside `sanitize()` in
`fields/rich-text/index.ts`. Both now call one exported `isUnsafeHref`, and
`safe-links.ts` is the single home for the question. Three copies of "is this
href dangerous" is how one of them drifts, and the fix would have added the third.

`findUnsafeLink` sits beside `stripUnsafeLinks` as the second walker over a
document: strip for the parse path, find for the validation path, one predicate
underneath.

## A file that was binary to git

`tests/fields/rich-text-safe-links.test.ts` contained a raw NUL byte where
`['javascript\0:alert(1)']` was meant — a real test case, since the scheme test
strips `[\s\0]`, but written as the byte rather than the source escape. Git
therefore treated the whole file as binary and refused to diff it, which is how a
test file can be edited without anyone reading what changed. It is now the escape
sequence, and both the strip and predicate cases cover NUL and space separately.

Worth checking for elsewhere: nothing else in the repo trips it today, but the
failure is silent in both directions — the tests pass and the diff simply
disappears.

## Coverage

27 new tests across the two files. `isUnsafeHref` over the unsafe and safe href
lists including non-strings; `findUnsafeLink` for depth, first-of-several, and
non-mutation; and `checkRichTextDocument` for both schemes, the nested case, the
truncation, the ordering against a structural failure, and one case through
`validateRichText` so the field-level validator is shown to reject and not just
the raw helper.
