---
area: structure
---

# Handlers take an explicit `AppContext`

The transport builds one context per request; the CLI, cron and plugin `setup()` share one system context. Nothing below a method reads the request scope, apart from the files `ambientReadExceptions` in `eslint.config.js` lists; only the transaction stays ambient. Hooks and `ctx.plugins` run as the context that called them. Prior art: Keystone's `context`, Payload's `req`.

**Rejected:** ambient reads such as `getCurrentUser()` (cannot tell which plugin asks); Hono's `context-storage` (a second dialect); a Payload-style `req` (the CLI, cron and MCP need a fabricated request).
