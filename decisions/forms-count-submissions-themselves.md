---
area: config
---

# The forms plugin counts submissions itself

Submissions are counted in the plugin's own table, per form and per `ctx.rateLimitKey`, by one upsert whose `WHERE` skips a full window, since D1 has no interactive transactions (`packages/plugins/forms/src/repository.ts`). Every HTTP request with no trusted address shares the key `no-trusted-ip`, as Better Auth's sign-in limiter does. A trusted caller (CLI, MCP, an Astro page) has no key and is not counted. The count is taken after the form is found.

**Rejected:** Better Auth's `rate_limits` (Better Auth owns and prunes it); a `globalThis` map (counts per isolate); counting before the form loads (a row per made-up slug); leaving addressless callers unlimited.
