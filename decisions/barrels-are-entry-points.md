---
area: structure
---

# A barrel is an entry point, not navigation

Barrels exist only where something outside the package reads them (`packages/astromech/src/exports/`, the admin's aliased component barrels), plus the `packages/astromech/src/types/index.ts` aggregate, and a lint rule refuses an import of any other `index` (`eslint.config.js`). A file of real code is named for what it holds, never `index`. `sideEffects` is a list because the UI instance guard, field registrations and stylesheets have effects.

**Rejected:** barrels as boundaries inside a package (most imports bypassed them); real-code `index.ts` files as lint exceptions (teaches that `index` means nothing).
