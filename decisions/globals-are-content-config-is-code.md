---
area: product
---

# Globals are content and config is code

Config lives in `astromech.config.ts`, secrets only in the environment, and editor-owned site-wide values are globals. Plugin state is a global, a plugin table or `ctx.storage`. Core ships no settings page and no key-value store.

**Rejected:** a WordPress-style General Settings page; admin-editable secrets; a shared key-value table (one plugin can overwrite another's keys).
