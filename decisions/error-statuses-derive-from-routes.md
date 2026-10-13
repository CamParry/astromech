---
area: structure
---

# Documented error statuses derive from each route

`errorResponses` (`packages/astromech/src/transport/http/routes/error-responses.ts`) writes each route's error statuses from its row and its method's metadata (`access`, `requires`, the input, the path), so a row lists in `refusals` only what no metadata says, such as the last admin. A 422 has its own `ValidationError` component, the schema the 422 builder is typed from.

**Rejected:** widening the shared `Error` component's `details` (documents `fields` on a 403); statuses written by hand per route (drift); a 404 on every path parameter; a 422 on a method with no arguments.
