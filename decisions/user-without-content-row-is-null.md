---
area: data
---

# A user without content reads as null

Every read, the session included, answers null for a `users` row with no content row, since only a write outside Astromech makes one.

**Rejected:** a stand-in with empty content (fails silently downstream); inserting on read (a write in a read path).
