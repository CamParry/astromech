---
area: structure
---

# A version is addressed by its number

Version methods take the resource's address, the locale and `version`, a number from 1 per resource and locale; the version row's id stays internal. `versions` answers metadata only, and `getVersion` adds `snapshot`, the output schema narrowed to the stored keys (`versionSchema` in `packages/astromech/src/content/schema.ts`). Payload addresses a version by its own id.

**Rejected:** the row id as address (an internal key in a URL); the full public type as snapshot (mixes present resource keys with past content); a snapshot per list item (reads every `fields` blob).
