# 0009 — One noun per role: service, method, client, API

**Date:** 2026-08-04
**Status:** accepted

One noun per role, never reused: service (a domain's callable operations), method (one operation), client (the assembled consumer object), API (the HTTP surface only); `*Api` types became `*Service`, `types/api.ts` → `types/services.ts` → `types/methods.ts`, `<domain>/descriptors.ts` → `<domain>/methods.ts`. Wire names like `entries.publish` and `AstromechApiError` stay; rejects reviving "SDK", bare domain exports, and `ScopedApis`.
