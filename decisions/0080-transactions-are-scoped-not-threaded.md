# 0080 — A transaction is a scope, not a handle passed by hand

**Date:** 2026-08-21
**Status:** accepted
**Supersedes:** 0076 (the method-on-the-repository point), 0055 (nesting throws), 0077 (the shared batch primitive; its semantics stand)

`transaction(fn)` becomes a `database/` function storing the Kysely handle in `AsyncLocalStorage`, so `getDb()` resolves it and repositories join automatically with no `db`/`txRepository` parameters; nesting joins the outer transaction rather than throwing. Hooks and fire-and-forget work stay outside the scope. Supersedes 0076, 0055 and 0077's shared primitive (`runBulk` deleted, loops inline). Rejected auditing explicit handles, savepoints, and a transaction-aware repository.
