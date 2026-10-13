---
area: structure
---

# A caller's error carries its own status

Every error a caller causes extends `ApiError` (`packages/astromech/src/errors/api-error.ts`) with its own status and code, and `onError` answers each from those two fields, so REST, RPC and plugin RPC answer alike. A scoped-handle refusal answers 401 without a signed-in user and 403 with one.

**Rejected:** an `instanceof` list in `onError` beside catches in single routes (the transports drift apart).
