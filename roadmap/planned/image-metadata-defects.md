---
milestone: 1.0
---

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

- [x] Record dimensions after applying EXIF orientation, from the image driver
      where one is configured, and drop the unused `orientation` key or set it.
- [x] Remove the GPS data from the stored original on upload and replace,
      blanking it in place in the EXIF and XMP with no re-encode, so the pixels
      and size are unchanged and it needs no image driver. Other metadata
      (camera, date, copyright) is kept.
- [x] Read dimensions for HEIC, AVIF and TIFF.
- [x] Add the version to the Cloudflare driver's origin URL.
- [x] Every setting that changes a variant's bytes joins its storage key.
- [x] Placeholders from the upright image; record whether an image has alpha.
- [ ] Animated WebP stays animated on sharp.
- [ ] HEIC: not resizable on sharp unless the build can decode it.
- [x] `size` from the stored bytes.
- [x] Tests: a rotated JPEG fixture stores upright dimensions; an uploaded
      original with GPS data is served without it.

## Left open

- **A driver setting is not in the variant URL.** The driver's `cacheKey`
  joins the variant's storage key and ETag, but not its URL, which is served
  `immutable` for a year. A browser or CDN that cached a variant keeps it
  after a quality change until the image's version changes. When
  `media.image.quality` lands (`roadmap/planned/image-optimisation.md`, which
  expects a new URL), the URL needs the setting too, as a focal point's `fp`.
- **HEIC variants fall back to the original.** The prebuilt sharp cannot decode
  HEVC, so a HEIC upload records its dimensions but gets no resized variants.
- **Rows uploaded before this work keep swapped dimensions** until their file
  is replaced: nothing rereads the stored originals.
- **Core sets no upload size limit.** An image is buffered whole to read its
  header, so the largest upload is bounded only by the runtime's memory and the
  host's request limit.
- **Some GPS data is out of reach of in-place removal.** A HEIF `Exif` item
  stored in several extents or by construction method 2 (an item reference) is
  left alone, as is a HEIF `Exif` item that starts inside the declared bytes
  of an earlier `Exif` item with a valid TIFF header (an earlier item of
  length 0, or one running past its data, ends where the next one starts), a
  GPS pointer in a TIFF page IFD after the first, XMP in a GIF, an XMP property
  split across two extended-XMP segments in a JPEG, and a location in a camera
  maker's MakerNotes.
- **A camera raw declared as another type is buffered whole.** A TIFF-based
  raw (DNG, CR2, NEF, ARW) uploaded with a non-image content type is read
  into memory for GPS removal, on top of the copy `formData()` already holds,
  so it takes twice its size. This adds to the missing upload size limit above.
- **A compressed text past the first 2 MB is left alone.** A PNG's compressed
  text chunks inflate to at most 2 MB in all, so a chunk beyond that keeps its
  GPS data. A real XMP packet or raw profile is well under 1 MB; the limit
  keeps a small compressed upload from costing seconds of work.
- **The XMP scan does not parse XML.** It finds names and brackets in the
  bytes, so a GPS element inside an XML comment blanks the text up to the next
  real end tag of that name, which can take other properties (`dc:rights`)
  with it. A `>` inside the value of a GPS element's attribute ends the start
  tag early, so the blanking breaks the packet. A prefix bound to the EXIF
  namespace that holds a non-ASCII character is not matched, so its GPS
  properties are kept.
