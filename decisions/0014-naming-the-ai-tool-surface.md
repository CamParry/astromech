# 0014 — Naming the AI tool surface

**Date:** 2026-08-04
**Status:** accepted

Three AI renames: `ToolDispatch` → `ToolDefinition` (MCP/model-SDK term; `ToolSpec` rejected as implying no implementation), `AIContextEntry` → `AIContextItem` ("entry" is the content domain; `AIContextDeclaration` rejected as coinage), and `transport/mcp/{dispatch,scoped-tools}.ts` → `transport/tools/` since the authoring plugin, not MCP, consumes them.
