# 0016 — The `fields` module's vocabulary

**Date:** 2026-08-04
**Status:** accepted

The presentational half of field types is "layout fields" (`section`, `tabs`, `tab`, `accordion`), after Payload; "chrome" and "container" as category words are retired (data-bearing nesting types are just "nested fields"). `FieldDefinition.container` → `boxed`, `isLayout`/`isContainer` flags deleted in favour of `descriptor.children !== undefined`, and `formatFieldPath`/`parseFieldPath` → `formatInstancePath`/`parseInstancePath`.
