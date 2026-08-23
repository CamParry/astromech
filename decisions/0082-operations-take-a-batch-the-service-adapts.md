# 0082 — Operations take a batch; the service adapts the single-id overload and drops its error envelope

**Date:** 2026-08-21
**Status:** accepted; refines 0077

Every mutating entry operation takes `ids: readonly string[]` and returns the batch; `entries/service.ts` is the sole overload adapter and unwraps `BulkOperationError` for a single id, while the HTTP error handler looks through the envelope for a `ValidationError` cause (422). Rejected separate `update`/`updateMany` services and wrapping single ids in the envelope on the Local API.
