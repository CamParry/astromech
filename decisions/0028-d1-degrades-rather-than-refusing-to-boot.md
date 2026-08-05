# 0028 — D1 degrades to sequential writes rather than refusing to boot

**Date:** 2026-08-06
**Status:** accepted

`d1()` declares `supportsTransactions: false`, so the three operations that
would otherwise open a transaction — entry create, bulk operations, staged-entry
merge — fall back to sequential writes. The open question left over from
building the driver was whether that should be allowed to happen silently, or
whether a D1 deployment should refuse to start when the site does something that
wants atomicity.

**It boots, and the fallback is the documented contract.**

The rejected alternative was a boot-time capability gate: on a driver with no
transactions, refuse to start (or refuse to register the affected operations)
rather than let a partial write happen. It loses on three counts.

**Nothing declares that a site needs atomicity.** There is no config key, and no
plausible one — the need is a property of an individual write, not of the
install. So the gate could only key off the driver's own capability flag, which
means every D1 site fails to boot, including the majority that never hit a
multi-step write. That is not a safety feature, it is refusing to support D1.

**The failure it prevents is milder than the one it causes.** Turning a
possible partial write into a guaranteed total outage is a bad trade when the
partial writes in question are recoverable:

- `runBulk` throws `BulkOperationError` carrying `succeededBefore`, so the
  caller is told exactly which ids landed.
- Entry create can leave a row whose relationship index rows were never written.
  Under `0004` that index is derived and rebuildable, so this is repairable
  rather than lost data.
- `mergeStaged` is ordered backup → update → cleanup precisely so a failure
  partway leaves a recoverable version and a staged row that can be re-merged.

**Declaring the capability already beats faking it.** The alternative that was
never on the table is a no-op `transaction()` that runs the callback and
resolves: identical behaviour, while reading at every call site as though it
were safe. Everything above depends on `supportsTransactions` being honest.

What this decision does commit to is saying so out loud. `apps/docs/configuration/database.md`
states the durability difference plainly rather than describing D1 as
transaction-free and leaving the consequence for the reader to derive.

Supersedes nothing; `0003` locked the data layer as SQLite-only, and this is the
narrower question that outlived it.
