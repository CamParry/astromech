---
area: data
---

# The repository owns locale fallback

A caller asks for fallback by name (`findOne(ref, { fallbackLocale })`), as with Payload's `find`; without it a read answers the exact locale or null. The resource table's handle stays private.

**Rejected:** fallback in service helpers (a layer on every read); a public table handle (calls write around the repository).
