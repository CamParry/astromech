---
name: api
description: API route and middleware patterns for Astromech. Use when writing or editing Hono route handlers, middleware, or anything in src/api/.
user-invocable: false
---

## Rules
- Validate with `schema.safeParse()` — never `.parse()`. On failure: `if (!parsed.success) return fromZodError(c, parsed.error)`
- Never throw in a handler — return error factories from `@/api/middleware/errors.js`: `notFound(c)`, `unauthorized(c)`, `forbidden(c, msg)`, `internalError(c, msg)`
- `fromZodError` returns a structured 422 with field-level messages
- Responses: `c.json({ data })` for single items and lists, `c.json({ success: true })` for mutations, `c.json({ data }, 201)` for creation
- Never query the database in a route — delegate to the service layer in `@/sdk/server/`
- Handler order: extract params → check existence → validate body → call service → return
