---
area: data
---

# The migration generator is ours

Astromech generates its own migrations: a rename is a drop plus an add, generation never prompts, and data migrations are hand-written (`packages/schema-engine/src`). Plugins ship self-contained journals.

**Rejected:** Atlas and drizzle-kit.
