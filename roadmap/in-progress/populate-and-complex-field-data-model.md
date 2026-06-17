# Populate & Complex Field Data Model

**Media populate**

- [ ] Single-traversal `populate` pass for media IDs in fields JSON: extract all IDs, fetch in one `WHERE id IN (...)`, reinsert hydrated objects
- [ ] Handle media IDs inside repeater rows, block items, and group fields in the same pass
- [ ] Extend SDK `populate` to include `'media'` alongside relations

**Relationship keys in repeaters & blocks**

- [x] Decide UUID-keyed objects vs arrays for repeater/block item storage — arrays of objects, each carrying a persisted `_id` UUID
- [x] Drag-reorder preserves item identity — reorder keeps the persisted `_id` (no key regeneration); ordering is array position, not a separate `_order` field
- [ ] Stable `_id`-based paths for nested-field relationship keys (foundation now in place via persisted `_id`)
- [ ] Migration strategy for pre-existing stored data (demo currently reseeds; no general migration framework yet)
