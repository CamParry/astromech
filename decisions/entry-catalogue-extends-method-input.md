---
area: structure
---

# Each type's catalogue extends the method input

An entry method declares its input once, with `type: z.string()` and the titleless payload. `packages/astromech/src/entries/catalogue.ts` fixes `type` to each type's literal and swaps in the type's own create or update schema for the method manifest and the OpenAPI document, and a test compares the keys both accept.

**Rejected:** a hand-written copy per type in the catalogue (nothing kept it in step); a per-method builder called with either type (every method file exports a second schema).
