---
area: data
---

# `relationships` is a derived index

The `relationships` table is rebuilt from field data and never read as a forward reference; a reference to a deleted target is dropped on the holder's next write. A declared reverse field is deferred, and if it returns it keys on the forward field path.

Each row records the `locale` of the content row holding the reference, and it is never null: a shared (`translatable: false`) field is copied into every locale's row, so its reference is indexed once per locale, as Strapi 5 joins each locale's row to its own relations. Reader-facing lookups (`where: { references }`) answer for one locale; delete-time reads (`usedBy`) span all of them.

**Why:** a derived index keeps polymorphism and non-atomic writes safe. Indexing the reference where it is stored keeps the index a plain function of the rows.

**Rejected:** a null locale for a shared field (Craft's `sourceSiteId`, Payload's `_rels.locale`), which fits a store that keeps a shared field once; `populate` (resolution would be `resolveRefs`); `onDelete` (nothing to act on in JSON); filtering into a target's fields; taxonomy tables; mirror-on-write symmetry.
