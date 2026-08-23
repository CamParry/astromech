# 0025 — HTML as the rich-text interchange format

**Date:** 2026-08-06
**Status:** accepted

Rich text crosses every boundary as HTML (`renderRichText`/`parseRichText` over one ProseMirror extension set); rejected segments (can't express structural change, no cross-block context), markdown (loses link `target`/`rel`/`class`), raw ProseMirror JSON (private format, verbose, models can't produce it) and `@tiptap/html` (needs `window`, runtime `happy-dom` peer, duplicate `@tiptap/core`). Trade accepted: translate's structure preservation becomes prompt plus human review, not a guarantee. `parseRichText` throws rather than returning empty because it's a write path.
