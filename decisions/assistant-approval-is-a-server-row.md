---
area: ai
---

# An assistant approval is a server-held row

A mutating tool declares no `execute`, so the `streamText` loop pauses there and writes the call to `plugin_assistant_approvals`. Once a separate request approves it, the call runs from the row's stored arguments, so a rewritten transcript cannot change what runs (`packages/plugins/assistant/src/loop/approvals.ts`).

**Rejected:** the AI SDK's tool approvals (re-read arguments from client-posted history; no replay protection or user binding); `policies/confirmation.ts` (the model answers its own question); signing the paused turn (no replay protection).
