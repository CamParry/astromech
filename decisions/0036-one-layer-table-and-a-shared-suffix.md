# 0036 — One layer table, and a suffix instead of an allowlist

**Date:** 2026-08-09
**Status:** superseded by 0070

dependency-cruiser's eleven hand-enumerated rules replaced by a single `LAYERS` table generating the no-upward rules, with `directory-must-be-in-a-layer` failing on an unlisted directory (the old rules had let `notifications/` import anything); four bespoke rules stay hand-written but slice their sets from the table. Admin's five-path allowlist becomes a `*.shared.ts` suffix (Payload's prior art) policed by `shared-files-stay-browser-safe`. `dependencyTypesNot: ['type-only']` works inside a rule's `to` but not at the top level. Superseded by 0070.
