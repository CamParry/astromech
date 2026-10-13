---
area: structure
---

# Plugin types join the site's registries

A plugin's field types sit in core's one `FieldType` registry (`packages/astromech/src/fields/field-type-registry.ts`), and its entry types and globals sit in `ResolvedConfig.entryTypes` and `globals` under `<namespace>/<name>`. Only the admin's URLs and sidebar branch on a plugin, and a site's key may not hold `/`, so ids cannot collide. Prior art: Payload's plugin collections, Strapi's `plugin::` UIDs.

**Rejected:** a separate plugin field registration (plugin values went unchecked on the server); per-plugin maps beside the site's (every consumer walks twice); bare keys (two plugins' `page` types collide).
