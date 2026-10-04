---
milestone: 1.0
---

# Image optimisation

Raised on 2026-10-03 from WPMU DEV Smush; decided 2026-10-04.

Prerequisite: `roadmap/in-progress/image-metadata-defects.md`. Cropping around a
focal point is `roadmap/planned/focal-point.md`.

## What exists

Most of Smush Pro is already here: AVIF and WebP variants made on request at
allowlisted widths, no upscaling, lazy loading and `decoding="async"`, width and
height on every image, immutable variant URLs, and originals kept
(`packages/astromech/src/media/serving/image/drivers/sharp.ts`,
`packages/astromech/src/media/serving/image/Image.astro`).

- Upload computes a blurhash on the sharp driver and stores it in
  `media.metadata.blurhash`; nothing renders it.
- sharp encodes AVIF at 50 and WebP at 78; the Cloudflare driver passes no
  quality and gets Cloudflare's 85.

## Prior art

- **WordPress 5.3** scales uploads above 2560px and keeps the original beside
  the `-scaled` copy, because it regenerates fixed sizes from it. Since 6.3 it
  adds `fetchpriority="high"` to the main image.
- **Smush** resizes on upload, strips metadata, converts to WebP and AVIF,
  lazy loads, and (Pro) preloads the largest image.
- **Payload, Sanity and Contentful** keep the original and resize on request.
- **Astro 7's `priority`** sets `loading="eager"`, `decoding="sync"` and
  `fetchpriority="high"`, with no preload link.
- **Placeholders:** `@unpic/placeholder` decodes a blurhash on the server into
  a data URI of about 150 bytes; thumbhash's data URI is an uncompressed PNG of
  several KB. Next.js names the prop `placeholder="blur" | "empty"`.

## Decided (2026-10-04)

- **A maximum size at upload replaces the original.**
  `media.image.maxSize: 2560` on the long side, `false` to turn it off. Only
  an image over the limit is resized: EXIF rotation applied to the pixels, only
  the colour profile kept, re-encoded in the same format at high quality, and
  dimensions, `size` and version read from the result. Animated images, SVG,
  GIF and HEIC are skipped. Rejected: keeping the original as WordPress does;
  variants are made on request up to 1920px and history keeps no files, so the
  copy would only cost storage. The Cloudflare driver does not resize at
  upload in 1.0, and its docs say so.
- **`priority` on `<Image>`**, Astro's name and behaviour: `loading="eager"`,
  `decoding="sync"`, `fetchpriority="high"`. No preload link, which would need
  writing into the page head.
- **The blurhash placeholder is rendered**, decoded on the server into a tiny
  data URI set as the image's background. `placeholder="blur" | "empty"`,
  defaulting to `blur` when a hash exists; skipped for an image with
  transparency, recorded at upload. Rejected: thumbhash, and decoding in a
  client script. The Cloudflare driver has no placeholder in 1.0.
- **One quality setting for both drivers:**
  `media.image.quality: { avif: 50, webp: 78 }`. Rejected: Astro's single
  number, since AVIF and WebP need different numbers for the same result.
- **Also in 1.0:** stripping metadata from originals
  (`roadmap/in-progress/image-metadata-defects.md`).

**Left out:** recompressing originals, converting PNG to JPG, re-optimising an
existing library (a CLI later; settings apply to new uploads), and a CDN.

**After 1.0:** making variants at upload rather than on first request, and a
dev-toolbar check for images served larger than they display.

Cost note: with the default 7 widths in 2 formats, Cloudflare Images' free
5,000 transforms a month covers about 350 new images.

## The work

- [ ] `media.image.maxSize` and the resize on upload and replace (sharp).
- [ ] `priority` on `<Image>` and in `buildImageAttrs`.
- [ ] The placeholder: decode on the server, the `placeholder` prop, the
      alpha flag at upload.
- [ ] `media.image.quality`, passed to both drivers and part of the variant
      key.
- [ ] `apps/docs`: the settings, and what the Cloudflare driver does not do.

## Testing

A 4000px upload is stored at 2560 with upright dimensions and its stored size;
an animated image and an SVG are stored as given; `priority` sets the three
attributes; a placeholder is rendered for an opaque image and not for a
transparent one; a quality change produces a new variant URL.
