---
area: data
---

# Users are deleted or suspended, not archived

Deleting a user is left to foreign keys: author columns go null, sessions and content rows cascade, and the audit trail keeps the id and email (`packages/astromech/src/users/tables.ts`). [Suspension](../roadmap/planned/user-suspension.md) removes access and leaves content alone, as in Directus, Ghost and Strapi.

**Rejected:** an `archived` status (Directus; a second trash); a role with no permissions (still signs in); Better Auth's bans (a second role system); reassigning content (WordPress; no ownership here); clearing author columns by hand (not atomic on D1).
