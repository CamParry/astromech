---
area: data
---

# A libsql migration run is one transaction

On libsql, all pending migrations run in one transaction, so a failure rolls the whole run back (`packages/astromech/src/database/drivers/libsql.ts`). A table rebuild, generated or hand-written, ends with `PRAGMA foreign_key_check` and turns `defer_foreign_keys` off.

**Why:** `defer_foreign_keys` holds only inside a transaction, and rebuilding a referenced table needs it. D1 has none: [d1-migrations-run-as-one-batch](../roadmap/proposed/d1-migrations-run-as-one-batch.md).

**Rejected:** `PRAGMA foreign_keys = OFF` (D1 ignores it, remote libSQL drops it); `BEGIN`/`COMMIT` in the file (the client pool rolls back); a transaction per migration (`Migrator` lacks it).
