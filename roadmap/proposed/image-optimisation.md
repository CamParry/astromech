# Image optimisation

Raised on 2026-10-03 from WPMU DEV Smush. **Target: 1.0.**

Most of Smush Pro is already here: AVIF and WebP variants made on request at
allowlisted widths, no upscaling, lazy loading and `decoding="async"`, width and
height on every image, immutable variant URLs, and originals kept
(`packages/astromech/src/media/serving/image/drivers/sharp.ts`,
`packages/astromech/src/media/serving/image/Image.astro`). Metadata and
dimension defects are `roadmap/planned/image-metadata-defects.md`.

## Prior art

- **WordPress 5.3** scales uploads above 2560px and keeps the original beside
  the scaled copy.
- **Smush** resizes on upload, strips metadata, converts to WebP and AVIF,
  lazy loads, and (Pro) preloads the largest image with `fetchpriority`.
- **Payload, Sanity and Contentful** keep the original and resize on request.

## Proposal

- **A maximum size at upload**, default 2560px on the long side.
- **A `priority` prop on `<Image>`** that sets `loading="eager"` and
  `fetchpriority="high"`, for the main image on a page.
- **Show the blurhash placeholder** that upload already generates and nothing
  renders, as a tiny inline image.
- **One quality on both drivers.** sharp uses AVIF 50 and WebP 78; the
  Cloudflare driver passes none and gets Cloudflare's 85.
- **Focal point** is `roadmap/proposed/focal-point.md`.

**After 1.0:** making variants at upload rather than on first request, and a
dev-toolbar check for images served larger than they display.

Cost note: with the default 7 widths in 2 formats, Cloudflare Images' free
5,000 transforms a month covers about 350 new images.

## Open questions

- Does the upload resize replace the original (recommended: nothing needs a
  larger file than the maximum) or keep it, as WordPress does?
- Is the placeholder decoded on the server into a data URI, or by a small
  script?
