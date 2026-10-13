---
area: data
---

# Field behaviour lives on `FieldType`

Every walk over fields asks the field's type rather than switching on type names, and `traverseFields` visits every node, as Payload's does (`packages/astromech/src/fields/traverse.ts`). `report:drift` flags a new `.type` comparison.

**Rejected:** walkers that switch on `group` or `repeater` (never reach plugin containers); fabricating values to reuse `children` for schema walks.
