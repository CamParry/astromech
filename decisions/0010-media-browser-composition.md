# 0010 — the media browser shares plumbing, not layout

**Date:** 2026-08-04
**Status:** accepted

Dissolve the shared `MediaBrowser` component: the media page and the field picker share plumbing (`useMediaBrowser`, `MediaFilters`, `MediaSortSelect`/`sortPatch`, `MediaEmpty`, a CSS class) but compose their own layout, since five of ten props only selected which caller was rendering. Rejects adding a sixth flag, fully splitting into two independent components, and an ~18-prop `MediaLibrary` sibling; reversed only if a third surface wants the page's exact layout.
