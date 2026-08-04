# Media Browser Split

Dissolve the shared `MediaBrowser` component into composed pieces, so the `/admin/media` page and
the media-field picker each own their own layout while still sharing the request, the filter
controls and the empty states.

**Status:** done. Built on `feat/media-browser-split` and merged to `main`; browser-verified against
the demo. Rationale and the rejected alternatives: `decisions/0010-media-browser-composition.md`.

Follows on from `roadmap/in-progress/media-admin-ui.md`, which introduced the shared component. The
merge was right about what to share and wrong about where to draw the line: it shares the layout and
parameterises the plumbing. This inverts that.

## Why

`MediaBrowser` takes ten props, and five of them exist only to tell the component which of its two
callers is rendering it:

- `selection` — a `bulk | pick` discriminated union that forks `MediaBrowserGrid` into two disjoint
  returns sharing nothing but the `.map`
- `viewMode` / `onViewModeChange` — page only, documented as "omit to force grid; the picker has no
  view switch"
- `onOpenItem` — page only
- `toolbarExtra` — page only, carrying the bulk-actions dropdown
- `showUploadButton` — picker only

`MediaBrowserList` is typed `Extract<MediaBrowserSelection, { mode: 'bulk' }>`. It is unreachable
from the picker by construction, which is the type system stating that these are two components.

Two concrete defects trace directly to the seam:

- **The picker modal had no vertical spacing.** `MediaBrowser` returned a bare fragment and inherited
  its rhythm from `.am-page-content`'s `gap`. `.am-modal-body` is a plain block, so the toolbar sat
  flush against the grid. The component never owned its layout because it was written against one
  host.
- **The page issues the media request twice.** `media/index.tsx` re-runs the same `useMediaQuery`
  that `MediaBrowser` already runs, because the shared component will not hand back its items and the
  page needs them for selection and bulk delete. Two components, one request, saved by react-query
  deduplication.

The surfaces already differ in six ways, every one of them currently spelled as a flag: list view,
bulk actions, detail modal, URL-vs-component query ownership, per-page (20 vs 24), and the
multi-select footer.

## What gets shared

Plumbing and controls, with no host flags anywhere:

- `useMediaBrowser(query, perPage)` — maps `MediaBrowserQuery` to `MediaQueryParams`, runs
  `useMediaQuery`, returns `items` / `totalItems` / `totalPages` / `isLoading` / `isError`. Kills the
  duplicated request and the duplicated param mapping.
- `MediaFilters` — the debounced `SearchInput` and the type `Select`. Owns the local input state so
  typing stays instant; both hosts use it identically.
- `MediaSortSelect` — the sort `Select` plus `sortOptions()`. Composed by the host rather than
  gated by a prop, because the page's list view sorts through `Table.SortTh` instead and simply does
  not render it.
- `MediaEmpty` — the filtered-no-results and the click-to-upload `UploadZone` states, which are
  genuinely identical across both hosts.
- Unchanged: `MediaCard`, `MediaRow`, `ContentGrid`, `Pagination`, `DropZone`, `UploadZone`.

## What gets split

- `components/media/media-library.tsx` — the page body: toolbar (bulk actions, filters, sort, view
  toggle), the select-all bar, grid or table, pagination. The route file keeps URL state, selection
  and bulk delete.
- `components/media/media-picker.tsx` — the picker body: toolbar (filters, sort, upload button),
  grid of selectable cards, pagination. `media-field.tsx` renders it inside its `Modal`.
- `media-browser.tsx` is deleted, along with `MediaBrowserSelection` and the `Extract<>` list type.

## Checklist

- [x] `useMediaBrowser` extracted; the page's duplicate `useMediaQuery` call removed. Verified in the
      browser: one `/api/media` request per query, where there were two calls before.
- [x] `MediaFilters`, `MediaSortSelect`, `MediaEmpty` extracted with no host-selector props
- [x] `MediaPicker` composed and `MediaBrowser` deleted. No `MediaLibrary` component — the route
      composes its own body from `MediaGrid` and `MediaTable`, because a wrapper would have needed
      roughly eighteen props to drill URL state, selection and bulk delete through it.
- [x] Each surface owns its own vertical rhythm rather than inheriting a host's `gap`
- [x] Render-level coverage for the picker and the shared pieces — 35 tests across `useMediaBrowser`,
      `MediaPicker`, `MediaEmpty` and `sortPatch`, each checked by reintroducing the bug it pins.
      Baseline moved 2421 → 2456.
- [x] Browser-verified against the demo: page grid, page list, table-header sorting, and the picker
      in both single and multiple mode
- [x] `decisions/0010-media-browser-composition.md` recording the seam and what it beat

## Follow-ups

- [ ] The page body has no render coverage at all — bulk-actions toolbar, select-all bar, the
      grid/table switch, the detail-modal wiring. That gap predates this work; the split just makes
      it addressable, since `MediaGrid` and `MediaTable` are now mountable on their own.
- [ ] `MediaFilters`' debounce is untested. Pinning it honestly needs fake timers plus a
      controlled-prop rerender loop, which is its own file rather than a bolt-on.

## Notes

Behaviour-preserving throughout. Nothing here changes what either surface does; if a browser check
shows a difference, that is a regression rather than an improvement.

`useMediaBrowser` keeps the `Browser` noun over `useMediaList`, because `MediaBrowserQuery` already
carries it and renaming the state type is churn with no reader benefit. The noun moves from naming a
component to naming the browsing state, which is what it always described.
