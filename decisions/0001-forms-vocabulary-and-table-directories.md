# 0001 — Forms vocabulary, and `tables/` over `schema/`

**Date:** 2026-08-02
**Status:** accepted

`{{token}}` in form emails is a "merge tag" (rejecting "placeholder", already taken by a field's input hint); a submitted field value is a "value", not an "answer"; plugin table descriptors live in `src/tables/` published as `./tables`, rejecting `schema/` as ambiguous with Zod schemas.
