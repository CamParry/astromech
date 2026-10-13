---
area: structure
---

# A duplicate fires the create hooks once

`entries.duplicate` is one create (`packages/astromech/src/entries/methods/duplicate.ts`): `entry:beforeCreate` and `entry:afterCreate` fire once with the source's own locale row, and every locale is prepared as `create` prepares a row, so an invalid copy answers 422. Payload's duplicate is likewise one create.

**Rejected:** a hook pair per locale (reports one new entry as several creates); no hooks (a copy skips what a plugin enforces on create).
