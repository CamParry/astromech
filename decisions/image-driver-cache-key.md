---
area: data
---

# An image driver names its settings in `cacheKey`

`ImageDriver.cacheKey` (such as `sharp-avif50-webp78`) is part of each variant's storage key and ETag, so a quality change makes new files (`packages/astromech/src/media/serving/image/driver.ts`).

**Why:** "cache key" is the HTTP and CDN term.

**Rejected:** Astro's `propertiesToHash` (transform options, not driver settings); `version` (taken by the content hash); hashing options in core (cannot see what drivers bake in).
