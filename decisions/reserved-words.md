---
area: naming
---

# Reserved words

Each word below names one thing here and is used for nothing else. [`TERMINOLOGY.md`](../TERMINOLOGY.md) says what it means; this list keeps what it beat.

- **admin resource**: a plugin's admin screens over its service methods (`defineAdminResource`). Rejected: bare "resource" (taken), "collection" (Payload's word for stored content), "admin view" or "screen" (one has several views), "model" (Django's word; implies storage).
- **capability**: a feature an entry type, global or driver declares support for (statuses, staging, signed URLs). Not a permission, though WordPress calls its permissions capabilities (`edit_posts`); here that is a [permission](../TERMINOLOGY.md).
- **driver**: a pluggable backend the config names. Rejected: "adapter" (reshapes one internal interface into another).
- **guard**: a check that stops when a precondition fails. An admin route guard keeps a page from rendering for a caller without the permission it needs (a TanStack Router `beforeLoad`, `AdminResourceGuard`); an `assert*` function ([A guard is an `assert*`](guards-are-assert-functions.md)) or a write guard (`content/write-guard.ts`) throws. The server's permission checks are access, not guards.
- **entry**: one content item. Rejected: "record".
- **global**: one editor-owned item with no list. Rejected: "single type" (Strapi's), "settings".
- **module**: a directory owning one thing in core. Rejected: "domain" (implies isolation, but modules call each other).
- **policy**: not used for authorisation. Laravel's is a class of checks on one model, Strapi's a function run before a route's controller, and Directus's a set of permissions attached to roles and users; nothing here is any of them. Use permission, role or access. Opt-in security rules are policies in the plain sense ([security policies are a plugin](security-policies-are-a-plugin.md)).
- **repository**: reads and writes over one table. Rejected: "store", "persistence".
- **request scope**: the per-request store a transport opens, named like the transaction scope. Rejected: "request context" (reads as the app context).
- **resource**: an entry, global, media item or user. Rejected: "record", "document".
- **resource type**: which of the four a resource is. Rejected: "resource spec", "resource model".
- **`tables.ts`, `schema.ts`**: a module's `defineTable` tables (plural even for one) and its Zod request validation. Rejected: `schema/` for table descriptors (ambiguous with Zod).
- **type**: an entry type's identifier. Rejected: `typeName` (wrong for a qualified id like `forms/form`), `typeId` (redundant).
