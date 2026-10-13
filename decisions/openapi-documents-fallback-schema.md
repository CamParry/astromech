---
area: structure
---

# OpenAPI documents a fallback key's own schema

`@hono/zod-openapi` throws on a `.catch`, so `withFallback` (`packages/astromech/src/services/fallback.ts`) converts the wrapped schema with zod's JSON Schema converter, attaches it as OpenAPI metadata and marks the key required, since every result carries it. Every output schema uses this one helper, so the document cannot drift.

**Rejected:** OpenAPI metadata written per key, or `required` per object (drift, and `extend` copies it); rebuilding schemas without their `.catch`es (reads the generator's internal registry); zod's converter alone (two converters' components in one document); patching the generator.
