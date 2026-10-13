---
area: data
---

# Media URLs are versioned by content hash

The admin's media URLs carry the file's content hash, or `updatedAt` without one (`packages/admin/src/utilities/media.tsx`). A focal point travels in the variant URL ([focal-point](../roadmap/planned/focal-point.md)); a future non-destructive crop must join the version.

**Why:** a caption edit or a focal nudge refetches nothing it need not.

**Rejected:** `updatedAt` (moves on a caption edit); a replacement counter (a second version).
