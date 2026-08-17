# Media serving owns its responses

Stage 7 of `roadmap/in-progress/application-instance-and-integrations.md` moved
media serving inside the Hono app, so `${mediaRoute}/*` now inherits the
app-wide middleware and error handling that the API surface uses. That was the
point of the stage — one terminal handler — but three of the things it inherited
are wrong for a public image URL.

**Media serving and media management are different surfaces.** Uploading,
listing, replacing and deleting go through `${basePath}/api/media` and should
keep the API's JSON envelope, its auth and its error shapes. `${mediaRoute}` is
a public, long-cached, browser-facing URL whose consumers are `<img>` tags and
CDNs, not API clients. It should answer like a file server.

## What it inherited

- **API error envelopes.** A failure inside `handleMediaRequest` now goes
  through Hono's `onError` and returns
  `{"error":{"id":"err_…","code":"INTERNAL_ERROR",…}}`. Observed with a corrupt
  PNG (`vipspng: libpng read error`). Before the move it produced Astro's 500
  page, which was no better — neither is a sensible answer to an `<img>` tag.
- **`Cross-Origin-Resource-Policy: same-origin`**, a Hono `secureHeaders`
  default. Media carried no CORP header before, so a browser on another origin
  embedding `<img src="…/_media/…">` is now blocked where it previously loaded.
  This cuts against the reason media keeps its own top-level prefix rather than
  living under `basePath`: it is long-cached, public, and ends up in third-party
  caches and other people's links.
- **`app.all`**, carried over verbatim from the old Astro route's
  `export const ALL`. The handler ignores the method entirely, so `POST` to a
  media URL returns the image with a 200.

## The fix

- [ ] The serving route answers with its own responses, not the API's. A missing
      or unreadable file is a **404**, not a 500 and not a JSON error envelope.
      Decide whether that means scoping `onError`/`onNotFound` away from
      `${mediaRoute}`, or the media handler catching its own failures — the
      second keeps the app's single-terminal-handler property intact.
- [ ] Decide the CORP value for media, and whether it follows `media.access`
      rather than being fixed. `cross-origin` is what a public CDN-facing asset
      normally sets; `same-origin` is right for private media.
- [ ] Narrow the mount to `GET` and `HEAD`, letting anything else fall through
      to a 404.
- [ ] Keep the response headers that are right for a file server: `ETag`,
      `Accept-Ranges`, `Content-Range`, and the long-lived immutable
      `Cache-Control` on canonical variants. These all survive today and must
      keep surviving — `roadmap/completed/media.md` and the stage 7 commit
      record what was verified.
- [ ] Test coverage for the 404 shape, the method narrowing and the CORP header,
      so none of them can regress silently. Nothing in the gate fetches a media
      file today, which is why all three landed unnoticed.

## Related

`${basePath}/api/media` is unaffected and should not change: management is an
API concern and belongs behind the API's auth, validation and error shapes.
