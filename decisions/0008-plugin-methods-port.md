# 0008 — `ctx.methods`, and what shape it takes

**Date:** 2026-08-04
**Status:** accepted

The plugin port is a single async `ctx.methods.tools({ readOnly? }): ToolDefinition[]` returning role-filtered, scope-dispatching tools, with core owning the four-step composition because it is security-relevant; rejects a narrow `ctx.methods.dispatch` (four seams, four chances to misorder) and a `globalThis` registry (untyped, competes with `ctx`). Named `methods` over `ctx.ai`/`ctx.manifest`, `tools` per MCP vocabulary; `formatAIContextMessage` ships from the main barrel instead.
