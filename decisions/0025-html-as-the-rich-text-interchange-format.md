# 0025 — HTML as the rich-text interchange format

**Date:** 2026-08-06
**Status:** accepted

Rich text leaves Astromech as HTML and comes back as HTML. `renderRichText`
serialises a ProseMirror document to an HTML string, `parseRichText` parses one
back, and both run over the same extension set, so one schema governs both
directions and anything outside a field's `allow` list is dropped by the schema
rather than by hand. This record covers the formats that lost, the guarantee
given up to get here, and two implementation choices worth not re-arguing.

## Rejected: segments

The removed content operations sent rich text as an ordered list of leaf text
runs and put the returned strings back in the same positions. Structure was
never in the payload, so structure could not change.

That is a real guarantee, and it was the right one for translate: a translated
document keeps its headings, its lists and its links because the model was never
given the chance to touch them. It is the wrong one for everything else.
Transform and generate exist to change structure — split a paragraph, turn prose
into a list, add a heading — and a format that makes structural change
impossible by construction cannot express their output at all.

Segments also broke translate in a subtler way. Each run travelled as its own
unit with no view of the text around it, which produces the classic failures:
pronouns whose antecedent is in the previous block, and terminology that drifts
between blocks because nothing kept it consistent. Isolation was sold as safety
and was partly just missing context.

## Rejected: markdown

Compact, familiar to models, and lossy in a way that mattered.

Markdown cannot express a link's `target`, `rel` or `class`. The old converter
worked around this by stashing those attributes and restoring them afterwards by
matching on href, which fails on a document with the same link twice, fails when
the model rewrites the URL, and silently loses the attributes when it fails.
Anything else the editor supports and markdown doesn't — a class on a paragraph,
an attribute on an image — has the same shape of problem, and the workaround
grows one special case at a time.

HTML is the format the editor's own schema already serialises to, so there is
nothing to reconstruct.

## Rejected: raw ProseMirror JSON

The most faithful option, and it round-trips perfectly by definition.

It loses on the other side of the exchange. ProseMirror's node-and-mark JSON is
a private document format, so a model has to be taught it in the prompt, has to
produce structurally valid nested `content` arrays with the right mark
positions, and gets no help from the vast amount of HTML it has already seen.
The output is verbose, which costs tokens on both directions of every call, and
a malformed document is a parse failure rather than a slightly wrong render. It
also makes the format the site's own integrations see an internal
implementation detail — HTML is what a translation service, a paste handler or a
third-party tool already speaks.

## The trade accepted

Structure preservation for translate stops being a construction guarantee and
becomes instruction plus review.

Nothing in an HTML round trip stops a model from dropping a list item or
promoting a paragraph to a heading. The schema clamps what tags can survive, not
whether the shape matches what went in. What replaces the guarantee is a prompt
that says to preserve structure and a result that lands staged for a human to
look at, which is the property
`decisions/0024-removing-the-content-operations.md` records as carrying forward.

That is a genuine downgrade for the one operation segments served well, and it
is worth it: one format serves all three operations, plus HTML paste, plus
editing rich text as HTML, plus any non-model service that speaks HTML.

## Rejected: `@tiptap/html`

Tiptap ships the parse helper directly. `parseRichText` writes its three lines
against `linkedom` and ProseMirror's `DOMParser` instead, for three reasons that
are all about how the package is packaged rather than what it does:

- its browser build needs a global `window`, which a Worker does not have;
- its `/server` build takes `happy-dom` as a **runtime** peer, which pulls a
  test-shaped DOM into production dependencies;
- it pins its own `@tiptap/core`, which duplicated the copy already installed.

The third one is the expensive one, because it does not fail at install. It
surfaces as `Two different types with this name exist, but they are unrelated`
on files that had nothing to do with the change, since a `JSONContent` from one
copy is not assignable to a `JSONContent` from the other.

`linkedom` supplies a DOM with no Node built-ins in it, so the same code runs on
Workers and in Node, and the parse itself is ProseMirror's own.

## `parseRichText` lets errors propagate

`renderRichText` catches and returns an empty string. `parseRichText` does not
catch at all, and this asymmetry is deliberate.

Rendering is a read path. A failure there produces an empty string on a page,
which is visibly wrong and costs nothing but that render; the stored document is
untouched and the next deploy can fix it. Parsing is a write path. A failure
there that resolved to an empty document would be written over an author's
content, and the failure and the data loss would be the same event, with no
error anywhere to say so. A thrown error on a write is the outcome that keeps
the old value.
