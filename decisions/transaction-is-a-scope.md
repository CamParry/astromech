---
area: data
---

# A transaction is a scope

`transaction(fn)` keeps the handle in `AsyncLocalStorage`, so repositories join without a `db` parameter and a nested call joins the outer scope (`packages/astromech/src/database/transaction.ts`). Hooks and fire-and-forget work run outside the scope. On D1, which has no transactions, it runs `fn` without one.

**Why:** D1's partial writes are recoverable, so it degrades rather than refusing to boot.

**Rejected:** passing handles by hand; savepoints; a transaction-aware repository; a boot-time capability gate.
