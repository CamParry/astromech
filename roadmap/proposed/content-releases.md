# Content releases

A draft holds one entry's next published state, and a schedule publishes it
at a set time (`roadmap/planned/drafts.md`, `roadmap/planned/schedules.md`). A
release groups several entries' drafts and publishes them together, now or at a
set time. Raised on 2026-10-03. **Target: after 1.0.**

## Prior art

Paid on every platform that has it: Sanity releases (an Enterprise add-on,
February 2025), Strapi Releases (Growth), Contentful Launch and Timeline
(October 2025), Storyblok (Premium).

## Open questions

- Is a release a named set of drafts, or a field on each?
- Does it publish all or nothing on D1, where only `batch()` is atomic?
- Can a release include deletions and unpublishing?
