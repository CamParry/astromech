---
area: structure
---

# Core composes the tool list

`ctx.methods.tools({ readOnly? })` returns the tools the caller's role may call, each dispatched through the scoped handle (`packages/astromech/src/transport/tools/scoped-tools.ts`). A plugin such as the assistant takes the list rather than building one.

**Why:** which tools a caller sees, and how each call is checked, decides what an untrusted caller can do.

**Rejected:** a narrow `ctx.methods.dispatch` for plugins to compose (four steps to misorder); a `globalThis` registry.
