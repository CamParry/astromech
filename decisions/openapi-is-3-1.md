---
area: structure
---

# The OpenAPI document is 3.1

Its schemas are JSON Schema 2020-12, the dialect the method manifest uses, so null is a type and an unknown value is `{}`. Paths are relative to one `servers` entry, `<basePath>/api`, and a root `security` names the session cookie, with `security: []` on a public plugin method. The development Swagger UI, openapi-typescript, orval and openapi-generator read 3.1.

**Rejected:** 3.0 (nullable unions and unknown values need a hand-written workaround per shape, and Redocly warns); absolute paths under a `servers` entry of `/` (names no base).
