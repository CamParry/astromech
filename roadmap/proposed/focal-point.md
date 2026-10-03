# Focal point

Every crop is centred, so a resized portrait can cut off a face. Raised on
2026-10-03. **Target: 1.0.**

## Prior art

Payload (2.0), Strapi, Sanity's hotspot, Craft 4, Kirby 4, Statamic and
Umbraco all store a focal point on the image.

## Proposal

- A focal point (x and y, 0 to 1) on each image, set by clicking the image in
  the media detail.
- Passed to both image drivers: sharp's `position` and Cloudflare Images'
  `gravity`.
- `<Image>` takes an aspect ratio, and crops around the focal point.

## Open questions

- Is a focal point enough, or does an image also need a crop box (Sanity's
  hotspot and crop)?
- Can a field override it per use?
