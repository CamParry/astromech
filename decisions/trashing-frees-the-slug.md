---
area: data
---

# Trashing frees the slug; restoring unpublishes

A new entry can take a trashed entry's slug, and a restored entry whose slug was taken gets the next free one and comes back unpublished (`packages/astromech/src/entries/repository/entries-table.ts`).

**Why:** WordPress moved to this in 4.5 and 5.6, so no URL goes live unchosen.

**Rejected:** the trash keeping its slug (Payload; blocks the URL); a `__trashed` slug suffix (WordPress; state in the slug); a restore that keeps the status.
