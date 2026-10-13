---
area: structure
---

# The media route answers like a file server

Its callers are `<img>` tags and CDNs, so a missing file is a plain-text 404, a failed transform serves the original (as Next.js does), and anything else is a `no-store` 500 (`packages/astromech/src/media/serving/handler.ts`). `Cross-Origin-Resource-Policy` is `cross-origin` for public media and `same-site` for private.

**Rejected:** the API's error handling, scoped away from the media prefix; `same-origin` for private media (not access control, and breaks a CMS on a sibling subdomain).
