---
area: data
---

# Column order is not part of the schema

Schemas compare columns by name, and code reads and copies them by name, so a migrated database and a fresh build with another column order are equal (`packages/schema-engine/src/oracle.ts`).

**Why:** drizzle-kit, Prisma and Rails also append added columns, and Kysely selects by name.

**Rejected:** rebuilding tables to keep column order (copies whole tables on D1; fails on referenced tables).
