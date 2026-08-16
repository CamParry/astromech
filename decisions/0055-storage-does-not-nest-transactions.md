# 0055 — Storage does not nest transactions

**Date:** 2026-08-16
**Status:** accepted

A tx-bound storage's `transaction()` throws. Storage does not emulate nested
transactions with savepoints, and the loud failure is the contract, not a gap.

## Context

Kysely refuses to open a transaction inside a transaction. Before the storage
layer made this loud, an inner `transaction()` call silently ran its statements
on the outer connection — they escaped the outer rollback, which is the worst
available behaviour: code that reads as atomic and isn't. The storage-layer
follow-ups made a tx-bound storage's `transaction()` fail loudly instead, and
left open whether to go further and support savepoint-based nesting.

## Decision

No savepoint support until a consumer exists. No production path nests a
transaction today, so savepoint emulation would be machinery with no caller,
carrying real costs: per-dialect savepoint SQL, release/rollback bookkeeping
layered over Kysely's refusal rather than with it, and a subtle behavioural
contract (partial rollback) that nothing exercises or tests.

## Rejected

- **Savepoint emulation now.** A feature with no reader; see above. If a real
  nesting need appears, this decision is the place a successor record points
  at, and the loud throw marks every call site that needs converting.
- **Silently reusing the outer transaction.** Reads as atomic, isn't — an inner
  "rollback" would leave the outer commit carrying the inner writes. This is
  the behaviour the loud failure exists to prevent.
