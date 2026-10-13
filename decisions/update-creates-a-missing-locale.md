---
area: data
---

# `update` with a new locale creates it

An `update` naming a locale with no content row creates that translation, as Payload's `update` with `locale` does; shared fields come from the default locale.

**Rejected:** a `createTranslation` method (a second write path for one row).
