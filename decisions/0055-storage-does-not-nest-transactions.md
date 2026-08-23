# 0055 — Storage does not nest transactions

**Date:** 2026-08-16
**Status:** superseded by 0080

A tx-bound storage's `transaction()` throws; no savepoint-based nesting until a consumer exists. Rejected savepoint emulation now and silently reusing the outer transaction. Superseded by 0080.
