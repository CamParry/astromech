# Image metadata defects

Found on 2026-10-03 by reading the media code while comparing it with Smush
(`roadmap/planned/image-optimisation.md`). Not yet reproduced in a test. The
second list was found on 2026-10-04 while planning that file and
`roadmap/planned/focal-point.md`.

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

## Variants and placeholders

- **Stale variants on Cloudflare after a replace.** The transform fetches the
  original's URL with no version (`originUrl` in
  `packages/astromech/src/media/serving/handler.ts`), and Cloudflare caches
  transforms under the source URL. A replaced image can keep serving the old
  picture under a new, immutable URL for a year.
- **The variant storage key holds only id, version, width and format**
  (`variantStorageKey` in `packages/astromech/src/media/serving/image/url.ts`).
  Once quality or a crop can change, an old file would be served under an
  unchanged URL.
- **Wrong placeholders.** The blurhash is computed without `.rotate()`
  (`packages/astromech/src/media/serving/image/drivers/sharp.ts`), so a rotated
  photo gets a sideways placeholder, and transparent pixels are encoded as
  their hidden colour.
- **Animated WebP becomes a still on sharp**, which is not passed
  `animated: true`; Cloudflare keeps the animation.
- **HEIC fails on every request on sharp.** `dimensions.ts` marks it
  resizable, but sharp's prebuilt binaries cannot decode it, so each request
  fails, logs, and serves the original, which most browsers cannot show.
- **`size` records the incoming file**, not the stored one, which will differ
  once uploads are resized (`roadmap/planned/image-optimisation.md`).

## The work

- [ ] Record dimensions after applying EXIF orientation, from the image driver
      where one is configured, and drop the unused `orientation` key or set it.
- [ ] Strip metadata from the stored original on upload when an image driver
      can (sharp; the Cloudflare driver cannot rewrite the original, so say so
      in its docs).
- [ ] Read dimensions for HEIC, AVIF and TIFF.
- [ ] Add the version to the Cloudflare driver's origin URL.
- [ ] Every setting that changes a variant's bytes joins its storage key.
- [ ] Placeholders from the upright image; record whether an image has alpha.
- [ ] Animated WebP stays animated on sharp.
- [ ] HEIC: not resizable on sharp unless the build can decode it.
- [ ] `size` from the stored bytes.
- [ ] Tests: a rotated JPEG fixture stores upright dimensions; an uploaded
      original with GPS data is served without it.
