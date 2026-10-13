---
area: config
---

# CLI commands are named after service methods

A command is `noun:verb` with the service's key (`entries:query` for `entries.query`), and one is generated per service method from its input schema. Core and plugins register commands through `defineCommand`, citty's own name, whose `run` gets the scoped services a plugin method gets ([cli-commands](../roadmap/planned/cli-commands.md)). The clean-up command is `prune`, as in git, Docker, npm and Laravel's `model:prune`.

**Rejected:** singular nouns (WP-CLI's `post`; breaks the match with `call`); renaming `query` to `list` (needs a lookup table); aliases; plugins importing citty; `purge` or `cleanup` for `prune`.
