---
area: structure
---

# Index rows name a type and a subtype

In the relationships index and the `usedBy` output, a resource's category is its type (`sourceType`, `targetType`) and an entry's type or a global's key is its subtype (`sourceSubtype`), as in Drupal's Entity Usage and WordPress's `register_meta`. The code uses the same words: a value holding a resource type is a `type`, and an entry type or a global key beside it is a `subtype`. Ids are unique across resources, because `findByTarget` matches `targetId` alone.

**Rejected:** "kind" (a second word); one merged column such as `'entry:post'` (Strapi; every reader parses it); `sourceKey`, `sourceEntryType` or `sourceBundle`; the type in the key (fixes sources only).
