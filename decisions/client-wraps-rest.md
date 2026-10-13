---
area: structure
---

# The client wraps REST, not the app

The application instance is the in-process surface; `astromechClient` is a fetch wrapper typed by the wire, and a test keeps the two in parity (`packages/astromech/src/transport/http/client.ts`). The admin calls `astromechUntypedClient`, the same object with `entries` and `globals` typed wide, because it names entry types and globals by runtime strings. The name follows tRPC's `createTRPCUntypedClient`.

**Rejected:** a shared contract or dependency-inversion ports between client and app; casting the typed client in each admin route (nine copies of one cast).
