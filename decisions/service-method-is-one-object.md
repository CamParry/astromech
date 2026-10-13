---
area: structure
---

# A service method is one object

Access, schemas, effect hints, the capability it `requires` and the handler are declared together, in core and plugins alike, like tRPC procedures (`packages/astromech/src/services/define-service-method.ts`). `defineService` takes a keyed record, stamps each method's name from its key and checks the record against the hand-written service interfaces.

**Rejected:** a contract catalogue apart from the handlers (schemas drift from handlers); an `assertCapability` call in each handler (some lacked it); self-named methods in an array (a method's name is not data); interfaces derived from the record (self-referential).
