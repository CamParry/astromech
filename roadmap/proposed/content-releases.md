# Content releases

Staged changes prepare one entry's next version
(`packages/astromech/src/entries/methods/staging/merge.ts`). A release groups
several entries' staged changes and publishes them together, now or at a set
time. Raised on 2026-10-03. **Target: after 1.0.**

## Prior art

Paid on every platform that has it: Sanity releases (an Enterprise add-on,
February 2025), Strapi Releases (Growth), Contentful Launch and Timeline
(October 2025), Storyblok (Premium).

## Open questions

- Is a release a named set of staged changes, or a field on each?
- Does it publish all or nothing on D1, which has no transactions?
- Can a release include deletions and unpublishing?
