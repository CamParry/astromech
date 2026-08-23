# 0056 — better-auth owns the `users` format, not its DDL

**Date:** 2026-08-16
**Status:** accepted

`users` gets a `defineTable` descriptor and joins `CORE_TABLES`, describing (not imposing) better-auth's on-disk format (ISO-8601 TEXT timestamps, 32-char alphanumeric ids), with a baseline-DDL parity test as proof; `sessions`/`accounts`/`verifications` stay hand-authored on `LEGACY_CODECS`. Rejected keeping hand-written storage, a descriptor outside `CORE_TABLES`, and teaching the parser to accept both timestamp formats.
