---
area: data
---

# The `where` DSL is the stable contract

Core uses `createRepository`'s typed methods, and the `where` DSL grows to meet it. `kysely()` covers the rest with no compatibility promise, named for the engine like `payload.db.drizzle`.

**Rejected:** `query()` (hides the coupling); a `findMany(qb => …)` callback; escaping at call sites (callers cannot emit `ESCAPE`).
