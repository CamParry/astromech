---
area: ai
---

# AI is built on Vercel's AI SDK

Core and the assistant plugin use the AI SDK (`ai`), and its frequent breaking majors are kept off the plugin surface. The assistant still requires Anthropic models, because deferred tool loading has no provider-neutral spelling.

**Rejected:** `@anthropic-ai/sdk` (one vendor, no `wrapLanguageModel`); LangChain JS or Mastra (agent frameworks, at the wrong level); LlamaIndex.TS (built for RAG).
