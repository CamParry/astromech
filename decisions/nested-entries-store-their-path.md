---
area: data
---

# Nested entries store their path per locale

Each content row stores its `path` (its ancestors' slugs and its own) under a unique index, and `position` is a fractional index ([ordered-and-nested-entries](../roadmap/planned/ordered-and-nested-entries.md)). The options are `orderable` (Payload's word) and `hierarchical` (WordPress's).

**Why:** a site finds a page with one indexed lookup.

**Rejected:** paths computed on read (WordPress, Payload 4; a tree walk per request); saving each descendant on a move (Payload, Umbraco #5237); nested sets (Craft; corrupted, #7784); `order` (SQL reserved word); `nested` (taken for fields); `nestable` (no CMS uses it).
