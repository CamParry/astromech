# Caching

What Astromech's own routes tell a cache, so a site that turns on Astro's route
caching (`routeRules`, `Astro.cache`) or puts a CDN in front knows which
responses it may store. Your own pages are yours to cache.

## The admin and the API are never stored

Every response under your `basePath`, the admin and everything under
`${basePath}/api` (sign-in included), sends `Cache-Control: private, no-store`.
Each answers one signed-in user, and neither Astro's cache providers nor a CDN
put the session cookie in their cache key, so a stored copy would reach
everyone. The admin also varies on its theme cookie.

Astromech's middleware also calls `cache.set(false)` on these routes after the
route has rendered, so a broad `routeRules` pattern such as `'/**'` cannot
cache them. It makes no cache call when your Astro config names no cache
provider.

## Media

The media route serves public files, so its responses may be stored, each for
as long as its `Cache-Control` says:

| Response                                                | `Cache-Control`                        |
| ------------------------------------------------------- | -------------------------------------- |
| A variant (`?w=…&f=…&v=…`), and its 304                 | `public, max-age=31536000, immutable`  |
| An original, its 304, 206 and 416                       | `public, max-age=300, must-revalidate` |
| The 302 from any other variant URL to the canonical one | `public, max-age=300, must-revalidate` |
| A 404                                                   | `no-store`                             |
| A 500                                                   | `no-store`                             |

A variant's URL carries the image's version, so replacing the file gives it new
URLs and a stored variant is never stale. The redirect to the canonical variant
names the current version, so it lives as long as an original: a replace shows
everywhere within five minutes. A 404 is not stored because the next request
may find the file: an id restored from a backup, or a width added to
`media.image.widths`.

Every response for an existing media item but a 404 carries the tag
`astromech:media:<id>` in a `Cache-Tag` header, the one Cloudflare reads, so
purging that tag clears the item's original and every variant from Cloudflare's
cache. A CDN that reads another header, such as Fastly's `Surrogate-Key`, needs
the tag copied into it. Astromech purges nothing itself.

The middleware calls `cache.set(false)` on the media route as on the admin, so
Astro's route cache never holds a file and a `routeRules` lifetime never
replaces the ones above.

## Prerendered pages

A page with `export const prerender = true` is rendered once, at build time,
and Astromech creates no application for it: the build needs no
`BETTER_AUTH_SECRET` and runs no scheduled jobs. So `getAstromech()` throws in
a prerendered page and in its `getStaticPaths`. Prerender only pages that read
no content, and render the rest on demand.
