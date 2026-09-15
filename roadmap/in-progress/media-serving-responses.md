# Media serving owns its responses

Stage 7 of `roadmap/completed/application-instance-and-integrations.md` moved
media serving inside the Hono app, so `${mediaRoute}/*` inherits the app-wide
middleware and error handling that the API surface uses. Three of the things it
inherited are wrong for a public image URL.

**Media serving and media management are different surfaces.** Uploading,
listing, replacing and deleting go through `${basePath}/api/media` and keep the
API's JSON envelope, its auth and its error shapes. `${mediaRoute}` is a public,
long-cached, browser-facing URL whose consumers are `<img>` tags and CDNs, not
API clients. It should answer like a file server.

## What it inherited

- **API error envelopes.** A failure inside `handleMediaRequest` goes through
  Hono's `onError` and returns `{"error":{"id":"err_…","code":"INTERNAL_ERROR",…}}`.
  Observed with a corrupt PNG (`vipspng: libpng read error`).
- **`Cross-Origin-Resource-Policy: same-origin`**, a Hono `secureHeaders`
  default. A browser on another origin embedding `<img src="…/_media/…">` is
  blocked. That cuts against the reason media keeps its own top-level prefix: it
  is long-cached, public, and ends up in third-party caches and other people's
  links.
- **`app.all`**, carried over from the old Astro route's `export const ALL`. The
  handler ignores the method, so `POST` to a media URL returns the image with a 200.

## Decisions

- **The handler catches its own failures**, which keeps the app's single
  terminal handler. A missing record or file stays a plain-text 404. A transform
  that fails serves the original instead, as Next.js's image optimiser does, and
  logs the error; the fallback carries the original's short `Cache-Control`, not
  the variant's immutable one, so a later request can still get the variant.
  Any other failure is logged and answered with a plain-text 500 and
  `Cache-Control: no-store`.
- **CORP follows `media.access`.** `'public'` answers `cross-origin`, which is
  what a CDN-facing asset sets. `'private'` answers `same-site`: it is not access
  control yet (`MediaAccess` in `packages/astromech/src/types/config.ts`), and
  `same-origin` would break a site that serves its pages and its CMS from two
  subdomains.
- **The mount is `GET`, which Hono also answers for `HEAD`.** Any other method
  gets a plain-text 405 with `Allow: GET, HEAD`, the answer a static file server
  gives, rather than the API's JSON 404.

## The work

- [ ] The media handler catches its own failures as above.
- [ ] Media responses carry the CORP value for `media.access`, and API
      responses keep `same-origin`.
- [ ] The mount answers `GET` and `HEAD`, and 405 for anything else.
- [ ] `ETag`, `Accept-Ranges`, `Content-Range` and the immutable
      `Cache-Control` on canonical variants keep surviving. `roadmap/completed/media.md`
      records what was verified.
- [ ] Tests through the composed app cover the CORP header in both modes, `HEAD`,
      the 405, a failing storage driver and a failing transform, so none of them
      can regress silently. Nothing in the gate fetches a media file through the
      app today.

## Related

`${basePath}/api/media` is unaffected: management is an API concern and stays
behind the API's auth, validation and error shapes.
