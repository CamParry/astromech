---
area: data
---

# A trashed entry is read-only

Every write to a trashed entry except `restore`, duplicate and permanent delete answers 409 `CONFLICT` (`packages/astromech/src/content/write-guard.ts`), as WordPress refuses to edit an item in the Trash.

**Rejected:** accepting writes (a publish or translation changes an entry no list shows).
