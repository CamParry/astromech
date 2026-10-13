---
area: ai
---

# Core AI hands out a model

AI is an optional core capability, so every plugin can reach it: `packages/astromech/src/ai/models.ts` hands out the configured model and callers use the AI SDK themselves. `ai.model` takes a model instance, not a string, because `wrapLanguageModel` cannot wrap a gateway id, and the live model travels through boot, never the JSON virtual config.

**Rejected:** a `rewrite()`-style facade; a second provider-agnostic layer.
