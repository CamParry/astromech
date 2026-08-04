# 0010 — the media browser shares plumbing, not layout

**Date:** 2026-08-04
**Status:** accepted

`MediaBrowser` was a single component behind both the `/admin/media` page and
the media-field picker, introduced by the media admin work so the picker would
stop being a worse library than the page. It is now dissolved: the two surfaces
compose their own layout from shared parts. This record exists because the
merge was recent and deliberate, and "we already tried sharing this" is the
first thing someone will say when the two surfaces next drift.

## What the merge got right, and what it got backwards

The right instinct was that the picker should not be a second-class library.
Before it, the picker had no search, no type filter, no sorting, no pagination
and no drag-drop upload; the page had all five. That gap is what the shared
component closed, and closing it was correct.

What it got backwards is which half to share. `MediaBrowser` shared the
**layout** — one toolbar, one results area, one return statement — and
parameterised the **plumbing** through props. Five of its ten props existed
only to tell it which caller was rendering:

- `selection`, a `bulk | pick` discriminated union that forked the grid into
  two disjoint returns sharing nothing but the `.map`
- `viewMode` / `onViewModeChange`, documented as "omit to force grid; the
  picker has no view switch"
- `onOpenItem`, page only
- `toolbarExtra`, page only, carrying the bulk-actions dropdown
- `showUploadButton`, picker only

`MediaBrowserList` was typed `Extract<MediaBrowserSelection, { mode: 'bulk' }>`
— the type system stating that the picker could not reach it. When the compiler
is describing one of your two callers as unreachable, they are two components.

## The two defects that made the case

Neither is a style objection; both were real and both trace to the seam.

**The picker modal had no vertical spacing.** `MediaBrowser` returned a bare
fragment and inherited its rhythm from `.am-page-content`'s `gap`. Inside
`.am-modal-body`, a plain block, the toolbar sat flush against the grid. The
component never owned its own layout because it had only ever been looked at in
one host.

**The page issued the media request twice.** `media/index.tsx` re-ran the same
`useMediaQuery` that `MediaBrowser` already ran, because the shared component
would not hand back the items the page needed for selection and bulk delete.
React-query deduplication meant this never showed up as two network calls,
which is why it survived review.

## What is shared now

The plumbing, with no host-selector props anywhere:

- `useMediaBrowser(query, perPage)` — browsing state to a page of results. One
  call per surface; the duplicate is gone.
- `MediaFilters` — the debounced search and the type filter
- `MediaSortSelect`, plus `sortPatch` as a separate export because the page's
  table headers apply the same patch the select does
- `MediaEmpty` — the no-results and upload-invitation states
- `MediaCard`, `MediaRow`, `ContentGrid`, `Pagination`, `DropZone`, `UploadZone`
  as before
- `.am-media-browser`, a shared CSS class for the column rhythm — shared layout
  survives as a class, which is the right size for it

The layout is not shared. The media route composes its own body from `MediaGrid`
and `MediaTable`; `MediaPicker` is the field modal's surface.

## The alternatives, and why they lost

**Keep `MediaBrowser` and add a sixth flag.** This is what fixing the missing
upload button looked like on the day: one `showUploadButton` prop, three lines.
It shipped, and it is what prompted this record — the fix was easy precisely
because the component had already accepted that shape, and each such prop makes
the next one more obviously fine. Rejected because the flag count only ever goes
up, and the two defects above were already the cost being paid.

**Split them completely, back to two independent components.** The honest
version of "these are two different screens". Rejected because it re-duplicates
the request mapping, the debounce, the sort options and the empty states — the
five things the merge was for — and those are where the bugs actually live. The
media admin audit found a dropped `sort`, a search firing per keystroke, and
selection surviving a filter change. None of those are layout bugs.

**Extract a `MediaLibrary` component to sit beside `MediaPicker`.** Symmetrical
and tempting. Rejected after counting: it would need roughly eighteen props,
because the page owns URL state, selection and bulk delete and would have to
drill all of it through. The route composing its own body has no indirection and
no prop bag. Symmetry between the two surfaces is not itself worth anything —
the whole point is that they differ.

## What would reverse this

If a third media-browsing surface appears and wants the page's exact layout,
the duplication between the route body and `MediaPicker` becomes real rather
than notional, and a shared layout component earns its place. The test is
whether the new surface wants the _same layout_, not merely the same data — if
it wants the data, it already has `useMediaBrowser`.

## Naming

`MediaBrowserQuery` keeps its name and moves to `admin/types/media.ts` beside
`ViewMode`, `TypeFilter` and `MediaSortKey`. The `Browser` noun now names the
browsing state rather than a component, which is what it always described;
renaming it to `MediaListQuery` would have been churn with no reader benefit.

`sortPatch` was `sortChange` in the first draft. It returns a
`Partial<MediaBrowserQuery>`, and `sortChange` reads as an event name — the
thing you would call a handler, not the thing you would call a value. "Patch"
for a partial update object is ordinary vocabulary and needs no teaching.
