# 0040 — `policies/` keeps its name, and `manifest-registry.ts` stays in `codegen/`

**Date:** 2026-08-09
**Status:** accepted

`policies/` keeps its name over `guards/` (Laravel/Pundit-style authorization policies fit all four files; NestJS-style `canActivate` guards misdescribe advisory and structural ones, and it pairs with `permissions/`), and `manifest-registry.ts` stays in `codegen/` over `boot/`, as the runtime slot paired with `method-manifest.ts`.
