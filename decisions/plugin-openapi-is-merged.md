---
area: structure
---

# Plugin methods are documented apart, then merged

`openApiDocument` (`packages/astromech/src/transport/http/routes/openapi-document.ts`) generates each plugin method's path on its own and merges it into the app's document when `/openapi.json` is requested. A schema the generator cannot write, or whose `.openapi('Name')` component clashes with one already registered, is left undescribed with a warning.

**Rejected:** registering plugin paths in the app's registry at boot (one bad schema empties the document, with no log); refusing to boot on a clash (takes a site down over its documentation); prefixing a plugin's component names (rebuilds schemas from the generator's internal registry).
