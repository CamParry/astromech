# Media Browser Split

Dissolve the shared `MediaBrowser` component into composed pieces, so the `/admin/media` page and
the media-field picker each own their own layout while still sharing the request, the filter
controls and the empty states.

**Status:** planned, to be built on `feat/media-browser-split`.

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

- [ ] `useMediaBrowser` extracted; the page's duplicate `useMediaQuery` call removed
- [ ] `MediaFilters`, `MediaSortSelect`, `MediaEmpty` extracted with no host-selector props
- [ ] `MediaLibrary` and `MediaPicker` composed; `MediaBrowser` deleted
- [ ] Each surface owns its own vertical rhythm rather than inheriting a host's `gap`
- [ ] Render-level coverage for both surfaces, following the `@testing-library/react` setup notes in
      `media-admin-ui.md` (explicit `afterEach(cleanup)`, `@vitest-environment happy-dom` docblock)
- [ ] Browser-verified against the demo: page grid, page list, and the picker in both single and
      multiple mode
- [ ] `decisions/0007-media-browser-composition.md` recording the seam and what it beat

## Notes

Behaviour-preserving throughout. Nothing here changes what either surface does; if a browser check
shows a difference, that is a regression rather than an improvement.

`useMediaBrowser` keeps the `Browser` noun over `useMediaList`, because `MediaBrowserQuery` already
carries it and renaming the state type is churn with no reader benefit. The noun moves from naming a
component to naming the browsing state, which is what it always described.
