# Image metadata defects

Found on 2026-10-03 by reading the media code while comparing it with Smush
(`roadmap/proposed/image-optimisation.md`). Not yet reproduced in a test.

- **Rotated photos store swapped dimensions.** `readImageDimensions`
  (`packages/astromech/src/media/serving/image/dimensions.ts`) reads the JPEG
  header and ignores the EXIF orientation flag, while sharp's `.rotate()` makes
  each variant upright. A portrait phone photo gets the wrong `width` and
  `height` on its `<img>` and the wrong srcset ladder. The `orientation` key in
  `packages/astromech/src/media/schema.ts` is declared and never set.
- **Originals keep their metadata, GPS included, and are public.** Variants
  drop EXIF (sharp's default), but the original is served at the media route and
  is the `<img>` fallback.
- **HEIC, AVIF and TIFF get no dimensions**, so they render without `width` and
  `height` and get no srcset.

The class: any fact about an image read from its header rather than from the
decoded image, which is what the variants are made from.

## The work

- [ ] Record dimensions after applying EXIF orientation, from the image driver
      where one is configured, and drop the unused `orientation` key or set it.
- [ ] Strip metadata from the stored original on upload when an image driver
      can (sharp; the Cloudflare driver cannot rewrite the original, so say so
      in its docs).
- [ ] Read dimensions for HEIC, AVIF and TIFF.
- [ ] Tests: a rotated JPEG fixture stores upright dimensions; an uploaded
      original with GPS data is served without it.
