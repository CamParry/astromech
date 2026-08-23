# 0076 — The repository always exposes `transaction`

**Date:** 2026-08-20
**Status:** superseded by 0080
**Supersedes:** 0028 (the call-site-visibility point only)

`transaction` becomes a required method on every `EntryRepository`, running the callback once sequentially with an undefined `db` on no-transaction drivers (D1) instead of being absent; the degrade moves from per-call-site branches into the method. Supersedes 0028's call-site-visibility point. Superseded by 0080.
