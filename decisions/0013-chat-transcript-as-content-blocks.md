# 0013 — The chat transcript crosses the wire as content blocks

**Date:** 2026-08-04
**Status:** accepted

Assistant transcript carries Anthropic content blocks verbatim in both directions (filtered only at render), because resuming a paused `tool_use` requires server-minted ids and unmodified `thinking` blocks. Rejected the AI SDK's UIMessage/ModelMessage split and a hand-written local block union; errors are separate `{kind: 'message'|'error'}` drawer entries, not blocks.
