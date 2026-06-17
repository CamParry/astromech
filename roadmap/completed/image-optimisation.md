# Image Optimisation

Implemented 2026-06-16. On-demand,
allowlisted AVIF/WebP variants behind a canonical app-owned media URL (`/_media/<id>.<ext>?w&f&v`);
storage driver demoted to a bytes-only backend; optimisation is a swappable `ImageDriver`. Shipped Node
(Sharp) + Cloudflare (Images) together to lock the driver shape.

- [x] Core: `StorageDriver` rework (`put`/`get`/`delete`/`list`, stream bytes, `getDirectUrl?`); derive `media.url`; add `metadata` JSON; `media.upload` orchestration + dimension extraction (pure JS) + variant lifecycle cleanup
- [x] `mediaRoute` (`/_media`) config + top-level mount; request handler (allowlist + version 302 + serve-original + cache write-back)
- [x] `ImageDriver` + `image: { driver, widths, avif }`; `defaultImageWidths`; `sharp()` (Node) with blurhash placeholder
- [x] `cloudflareImages()` driver (`cf.image`, `cachesVariants`) + `src/storage/drivers/r2.ts`
- [x] Responsive `<Image>` — framework-agnostic `buildImageAttrs` core + thin Astro renderer (srcset/sizes/`<picture>`/intrinsic dims; blur-up deferred)
- [ ] Deferred: art-directed crops (`h`+`fit`), signed-URL escape hatch, transform concurrency caps, visual blur-up render, Next/Vercel renderer, S3 driver
