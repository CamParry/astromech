---
area: data
---

# Entry types and globals are self-contained objects

`entries` and `globals` are arrays of `defineEntryType` and `defineGlobal` objects that carry their own name, as Payload's `collections` carry `slug`.

**Why:** site and plugin types share one shape, and a duplicate name crashes rather than overwrites.

**Rejected:** name-keyed records (site and plugin types named differently); a fields mode on `admin.pages` (a route, not a resource).
