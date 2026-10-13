---
area: structure
---

# Resources share helpers, not a generic service

`content/` holds the locale, capability, sort, relationship and `usedBy` code the four resources share, over `RESOURCE_CONFIG` (`packages/astromech/src/content/resources.ts`), after Strapi's core service factories. A caller names the resource (`resource: 'user'`) and the helper reads the config; lint refuses the import elsewhere. The config holds no repository, since each resource has its own columns.

**Rejected:** passing the config in (spread across about 35 files); versions or staging method factories (more hooks than code saved, even for two resources); a base class; Payload's split (copies the versions operations for globals).
