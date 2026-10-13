---
area: data
---

# `relationships` is a derived index

The `relationships` table is rebuilt from field data and never read as a forward reference; a reference to a deleted target is dropped on the holder's next write. A declared reverse field is deferred, and if it returns it keys on the forward field path.

**Why:** a derived index keeps polymorphism and non-atomic writes safe.

**Rejected:** `populate` (resolution would be `resolveRefs`); `onDelete` (nothing to act on in JSON); filtering into a target's fields; taxonomy tables; mirror-on-write symmetry.
