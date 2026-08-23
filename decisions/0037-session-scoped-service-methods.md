# 0037 — A method whose subject is the caller declares `sessionScoped`

**Date:** 2026-08-09
**Status:** accepted

A `ServiceMethodContract` declares `sessionScoped: true`, meaning `userId` is filled from the request context by `policies/scoped-services.ts` (at the scoped handle, not the dispatcher) and any caller-supplied value is overwritten; no permission is declared, since any signed-in caller may act on their own rows. Rejected a general `sessionArgument: 'userId'` field, folding in `users.get`'s self-access exemption, and leaving notifications out of the manifest.
