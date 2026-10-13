---
area: ai
---

# The transcript keeps Anthropic content blocks

The assistant stores Anthropic content blocks verbatim and filters them only at render, because resuming a paused `tool_use` needs the server-minted ids and unmodified `thinking` blocks. For the same reason the loop uses no `smoothStream`, which drops reasoning metadata from the stored transcript (`packages/plugins/assistant/src/loop/run.ts`).

**Rejected:** the AI SDK's UIMessage and ModelMessage split; a hand-written block union.
