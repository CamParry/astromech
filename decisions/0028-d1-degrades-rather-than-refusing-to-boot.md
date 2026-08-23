# 0028 — D1 degrades to sequential writes rather than refusing to boot

**Date:** 2026-08-06
**Status:** accepted

D1 declares `supportsTransactions: false` and the three transactional operations fall back to sequential writes, documented rather than blocked; rejected a boot-time capability gate because nothing declares a site needs atomicity so every D1 site would fail to boot, and the partial writes are recoverable. A no-op `transaction()` was never on the table.
