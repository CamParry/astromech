---
area: structure
---

# Bulk writes are POST action routes

A multi-id write is `POST /entries/:type/bulk-<action>` with `ids` in the body, as in Strapi's admin API, since most actions have no HTTP method and a `DELETE` body has no defined meaning. One entry follows the same rule: `DELETE /entries/:type/:id` deletes, and `POST /entries/:type/:id/trash` trashes.

**Rejected:** `PATCH` or `DELETE` on the collection (Directus); `where` in the query string (Payload); one batch endpoint (moves permission checks out of the route table); a `DELETE` that trashes beside a `/force` route (WordPress; one verb, two methods).
