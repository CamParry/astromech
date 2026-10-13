---
area: toolchain
---

# Type-aware lint catches defects, not style

`lint` runs `switch-exhaustiveness-check` (a `default` does not cover a missing union member) and `no-unnecessary-type-assertion` over the packages' sources, and `@tanstack/eslint-plugin-query`'s recommended rules, which catch a query key missing a dependency, over the admin and plugin pages (`eslint.config.js`). The `no-unsafe-*` rules join them one by one ([lint-and-type-checks](../roadmap/planned/lint-and-type-checks.md)).

**Rejected:** the `recommendedTypeChecked` and `strictTypeChecked` presets (mostly police shape); a separate `lint:types` check (the rules add about 2 s).
