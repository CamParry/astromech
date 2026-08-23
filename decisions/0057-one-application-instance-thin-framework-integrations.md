# 0057 — One application instance, thin framework integrations

**Date:** 2026-08-16
**Status:** proposed

Proposes a single factory-built `Astromech` application object behind memoised `getAstromech()`, config supplied only at boot and read via accessor, thin `integrations/astro/` doing protocol adaptation only, `boot/` reduced to composition root (config pipeline to `src/config/`, CLI passes to `transport/cli/`, `scheduled.ts` to `integrations/cloudflare/`); the `AstromechClient` transport mirror and `astromech/local` are dropped. Rejected a class, `app.api` container nesting, full DI threading, extending the client contract, and migrations on serving boot. [Five points reversed by 0063.]
