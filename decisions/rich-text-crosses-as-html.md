---
area: ai
---

# Rich text crosses every boundary as HTML

`renderRichText` and `parseRichText` convert over one ProseMirror extension set (`packages/astromech/src/fields/rich-text/parse.ts`). `parseRichText` throws rather than returning empty, because it is a write path. Translation keeps structure by prompt and review, not by guarantee.

**Rejected:** text-run segments (cannot change structure); markdown (loses a link's `target`, `rel` and `class`); raw ProseMirror JSON (models cannot produce it); `@tiptap/html` (needs `window`).
