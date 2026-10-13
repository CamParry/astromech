---
area: product
---

# Any content change clears the page cache

Every response Astromech serves through Astro's route cache carries one tag, cleared after any write that changes what a public read returns; the site sets lifetimes with `routeRules` ([page-caching](../roadmap/planned/page-caching.md)). Ghost clears everything when published content changes. Every page renders again after a publish; targeted tags can come later without changing the site-facing API.

**Rejected:** tags per entry, type and query (EmDash); WordPress cache plugins' lists of pages to clear (Hummingbird, WP Rocket; miss home-page lists and related posts).
