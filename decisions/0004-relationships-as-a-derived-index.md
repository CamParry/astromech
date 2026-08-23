# 0004 — Relationships: a derived index, and what was not built

**Date:** 2026-08-03
**Status:** accepted

The `relationships` table is a rebuildable derived index over field data (never a forward read), which is what makes polymorphism and non-atomic writes safe; order lives only in field data, paths key on `_id` and store both schema and instance renderings. Rejects `populate` (security leaks via relation traversal), any `onDelete` (cascade/set-null unimplementable in a JSON blob, restrict refused on principle), declared reverse fields (deferred; if revived, key on forward field path not relation name), filtering into a target's own fields, taxonomy tables, and mirror-on-write symmetry; editorial identity lives on a `profile` entry linking to `users`, and `defineTable` grows composite primary keys rather than being worked around.
