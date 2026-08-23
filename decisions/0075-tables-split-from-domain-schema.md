# 0075 — Tables split out of the domain schema file

**Date:** 2026-08-20
**Status:** accepted

`defineTable` tables move out of `<domain>/schema.ts` into `<domain>/tables.ts` (plural, even for single-table domains); `schema.ts` now means Zod request validation only, so a domain without validation has no `schema.ts`. Public subpath `astromech/database/schema` unchanged. Rejected splitting only the mixed files.
