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
