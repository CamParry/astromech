# 0090 — The `ai` slot holds models, and boot assembly leaves the middleware file

**Date:** 2026-08-23
**Status:** accepted
**Supersedes:** 0032 in part (the naming half of its `ai` exception)

`WrappedAiConfig`/`setAiConfig`/`getAiConfig`/`buildAiConfig` become `AiModels`/`setAiModels`/`getAiModels`/`buildAiModels`, and `buildAiModels` moves from `ai/middleware.ts` to `ai/models.ts`. `AiConfig` (the authored block) stays; the read stays `get` despite returning null, per 0072's registry-probe rule and its five sibling probes; rejected `ModelRegistry` and `ResolvedAiConfig`.
