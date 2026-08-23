# 0064 — The composition root is `astromech.ts` at the source root

**Date:** 2026-08-18
**Status:** accepted

The application factory moves to root-level `src/astromech.ts` (with `registrations.ts`, `plugin-access.ts`) matching Payload/Strapi convention; `boot/` dissolves, the sequence is inlined, "phase" vocabulary dropped, and migration orchestration goes to `database/migrations.ts`. Chose brand name `astromech` over generic `application`; relaxed the dependency-cruiser layer rule rather than keep the factory in a subdirectory to satisfy the tool.
