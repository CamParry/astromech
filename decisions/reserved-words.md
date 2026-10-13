---
area: naming
---

# Reserved words

Each word below names one thing here and is used for nothing else. [`TERMINOLOGY.md`](../TERMINOLOGY.md) says what it means; this list keeps what it beat.

- **admin resource**: a plugin's admin screens over its service methods (`defineAdminResource`). Rejected: bare "resource" (taken), "collection" (Payload's word for stored content), "admin view" or "screen" (one has several views), "model" (Django's word; implies storage).
- **driver**: a pluggable backend the config names. Rejected: "adapter" (reshapes one internal interface into another).
- **entry**: one content item. Rejected: "record".
- **global**: one editor-owned item with no list. Rejected: "single type" (Strapi's), "settings".
- **module**: a directory owning one thing in core. Rejected: "domain" (implies isolation, but modules call each other).
- **policy**: code that decides what an actor may do. Rejected: "guard" (a per-request route interceptor).
- **repository**: reads and writes over one table. Rejected: "store", "persistence".
- **request scope**: the per-request store a transport opens, named like the transaction scope. Rejected: "request context" (reads as the app context).
- **resource**: an entry, global, media item or user. Rejected: "record", "document".
- **resource type**: which of the four a resource is. Rejected: "resource spec", "resource model".
- **`tables.ts`, `schema.ts`**: a module's `defineTable` tables (plural even for one) and its Zod request validation. Rejected: `schema/` for table descriptors (ambiguous with Zod).
- **type**: an entry type's identifier. Rejected: `typeName` (wrong for a qualified id like `forms/form`), `typeId` (redundant).
