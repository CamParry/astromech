# 0085 — `type` is the parameter, `entry-types` is the file

**Date:** 2026-08-22
**Status:** accepted

An entry type's identifier is `type` everywhere inside `entries/` (not `typeName`, which is inaccurate for qualified ids like `redirects/redirect`, nor `typeId`, which is redundant in-domain), and `entries/type-ids.shared.ts` is renamed `entry-types.shared.ts` after its subject.
