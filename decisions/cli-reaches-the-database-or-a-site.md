---
area: config
---

# A CLI command reaches the database or a site

A command opens the database directly, or reaches a site over HTTP with an API key ([cli-commands](../roadmap/planned/cli-commands.md), [api-keys](../roadmap/planned/api-keys.md)). Permissions come from the key or `--as`, never from which command runs. The bulk commands (`db:*`, `export` and `import`, `search-replace`, `fields:*`) are direct only.

**Why:** a Worker request gets 30 seconds of CPU and 128MB by default, and a site with broken migrations cannot migrate itself over HTTP.

**Rejected:** limiting content commands to HTTP as more sensitive (`search-replace` changes as much as `users:create`).
