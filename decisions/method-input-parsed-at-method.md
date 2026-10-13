---
area: structure
---

# Method input is parsed and typed at the method

`bind()` and the plugin service proxy parse every call against the method's `input` (`packages/astromech/src/services/parse-method-input.ts`), so in-process calls, hooks, jobs and HTTP get one check. The handler's types come from the same schema: it sees `z.output`, and a caller passes `z.input`. One cast remains in `packages/astromech/src/services/json.ts`, because `z.json()` emits a recursive schema the manifest and OpenAPI generator cannot use.

**Rejected:** parsing at each transport edge (in-process callers go unchecked); a hand-written type per payload reconciled by a cast (drifts silently).
