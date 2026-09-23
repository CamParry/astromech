---
name: api
description: API route and middleware patterns for Astromech. Use when writing or editing Hono route handlers or middleware.
user-invocable: false
---

## Rules

- A REST route over a service method is a row in `transport/http/routes/http-routes.ts`. `mountRestRoutes` builds its arguments from the path, the query string and the body, and the method's input schema validates them. Write a handler by hand only for what a row cannot state, and say why above it.
- Validate with `schema.safeParse()` — never `.parse()`. On failure: `if (!parsed.success) return fromZodError(c, parsed.error)`
- Never throw in a handler — return the shared error-factory helpers: `notFound(c)`, `unauthorized(c)`, `forbidden(c, msg)`, `internalError(c, msg)`
- `fromZodError` returns a structured 422 with field-level messages
- Responses: `c.json({ data })` for single items and lists, `c.json({ success: true })` for mutations, `c.json({ data }, 201)` for creation
- Never query the database in a route — delegate to the service layer
- Handler order: extract params → check existence → validate body → call service → return
