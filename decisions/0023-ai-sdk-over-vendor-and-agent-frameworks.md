# 0023 — AI SDK over the vendor SDK and over agent frameworks

**Date:** 2026-08-06
**Status:** accepted

Built the `ai` capability on Vercel's AI SDK rather than `@anthropic-ai/sdk` (vendor-locked, no `wrapLanguageModel`), LangChain JS/Mastra (agent frameworks at the wrong altitude) or LlamaIndex.TS (RAG-first), accepting roughly three breaking majors a year by keeping SDK types out of the plugin surface. The assistant still refuses non-Anthropic models because tool search with deferred loading has no provider-neutral spelling.
