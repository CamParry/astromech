---
milestone: 1.0
---

# Focal point

Every crop is centred, so a resized portrait can cut off a face. Raised on
2026-10-03; decided 2026-10-04.

Builds on `roadmap/planned/image-optimisation.md` and the variant fixes in
`roadmap/completed/image-metadata-defects.md`.

## Prior art

- Payload (2.0, on by default), Strapi, Sanity's hotspot, Craft 4, Kirby 4,
  Statamic and Umbraco all store a focal point on the image. Strapi stores it
  but does not apply it to its formats; Directus stores pixels, which a new
  file at another resolution breaks.
- **Crop boxes:** Sanity (hotspot and crop) and Umbraco (named crops) add one.
  Sanity stores both on the image field in each document; Umbraco's media
  picker has local crops.
- **Drivers:** sharp's `position` takes named positions and the `entropy` and
  `attention` strategies, not coordinates; Cloudflare Images takes
  `gravity: { x, y }`.

## Decided (2026-10-04)

- **Stored on the `media` row:** nullable `focalX` and `focalY`, 0 to 1, where
  empty means centre. One for every locale. Exposed as
  `focalPoint: { x, y } | null` and written through the media update. Kept on
  replace, since a fraction survives a new resolution. Not in the `metadata`
  JSON, which a replace overwrites.
- **Editing:** click the preview in the media detail, nudge with the arrow
  keys, "Reset to centre". Previews at 1:1, 16:9 and 4:5 use CSS
  `object-position`, so they make no server requests.
- **No crop box in 1.0.** Replacing the file with an edited one covers a
  permanent crop; a crop box can be added later.
- **No per-use point stored in fields.** `<Image position>` overrides the point
  in code.
- **The drivers:** sharp cuts the largest box of the target aspect ratio
  centred on the point and clamped to the image, then resizes it. Cloudflare
  gets `fit: 'cover'` and `gravity: { x, y }`.
- **Variant URLs carry the point:** `fp=<x>,<y>`, rounded to 0.01, only on
  cropped variants, so width-only URLs survive a change. The handler redirects
  a stale `fp` to the current one, as it does a stale version, so cached pages
  still resolve. `fp` joins the variant storage key, and `h` is bounded to a
  reduced ratio. A change clears the page cache as a media update
  (`roadmap/planned/page-caching.md`).
- **`<Image>` follows Astro:** `width` with `height` sets the aspect ratio,
  `fit` defaults to `cover`, `position` defaults to the focal point, and
  `object-position` is always output so CSS cropping matches the server's.
  Rejected: unpic's `aspectRatio` and a `crop` prop.

Cloudflare bills each new crop as a transformation ($0.50 per 1,000 after
5,000 a month).

## The work

- [ ] `focalX` and `focalY` on `media`, with `pnpm run db:generate` and the
      Cloudflare baseline hand-applied; `focalPoint` in reads, the update
      method and `astromech/fetch`.
- [ ] The crop in both drivers; `fp` and `h` in the variant URL, the storage
      key and the stale-point redirect.
- [ ] `<Image>`: `height`, `fit`, `position`, `object-position`.
- [ ] The admin: setting the point, the previews, reset.
- [ ] `TERMINOLOGY.md` and `apps/docs`.

## Testing

A 16:9 crop of a portrait keeps the focal point inside the box; a changed point
gives a new cropped URL and leaves width-only URLs alone; an old `fp` redirects
to the current one; a replace keeps the point; both drivers receive the same
crop.
