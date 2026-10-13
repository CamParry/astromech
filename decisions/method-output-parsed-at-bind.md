---
area: structure
---

# Method output is parsed at `bind()`

`bind()` and the plugin service proxy parse each result through the method's `output` (`packages/astromech/src/services/parse-method-output.ts`), so a handler returns the resource and every caller, plugins and site code included, gets the public type. A plugin method may leave `output` out. Hook payloads and the session's user go through `parseOutput` too. Output schemas are plain `z.object`s that strip unknown keys and never transform.

**Rejected:** parsing at the HTTP layer only (plugins see the private content-row id); a mapper per resource (unchecked against its type); `.transform()` or `.pipe()` to the public shape (`@hono/zod-openapi` documents the input side).
