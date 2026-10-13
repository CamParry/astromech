---
area: data
---

# The internal model is a resource

A repository returns `UserResource`, the `users` row joined with one locale's content, and the service maps it to `User`, the public name plugins and sites import. A row is only ever a table row (`UserTableRow`).

**Rejected:** `UserRow` (a join is not a row); `StoredUser` (several rows are stored); `UserEntity` (contested, reads like "entry"); `UserInstance` (says nothing); `UserInternal` (where, not what); `UserOutput` or `PublicUser` (a suffix on every plugin signature).
