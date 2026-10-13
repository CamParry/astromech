---
area: data
---

# An image driver says which types it transforms

`ImageDriver.canTransform` gates the media route and `<Image>` per content type (`packages/astromech/src/media/serving/image/transformable.ts`), and sharp learns HEIC support by decoding a sample once.

**Why:** prebuilt sharp reads HEIC headers but cannot decode HEVC.

**Rejected:** `sharp.format.heif` (true without a decoder); a fixed type list (cannot tell libvips builds apart); probing at boot (a decode most processes never need).
