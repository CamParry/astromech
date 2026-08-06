# `toolUseId` is the last Anthropic word in the assistant

`@astromech/assistant` runs on the AI SDK, where a call's identifier is
`toolCallId` on a `ToolCallPart` and a `ToolResultPart`. The approval path still
calls the same value `toolUseId`, from Anthropic's `tool_use` block:

- `ApprovalRequest.toolUseId` and `ApprovalDecision`'s neighbours in `src/types.ts`
- `ClaimedApproval.toolUseId` and `ApprovalDraft` in `src/approvals/storage.ts`
- `ApprovalRow` and the `tool_use_id` column in `src/tables/approvals.ts`
- the `UnrunCalls` / `RejectedCalls` keys in the drawer

Nothing is wrong, and the code reads consistently within itself. The cost is that
a reader following a value from `part.toolCallId` into an approval row watches it
change name for no reason, and the vocabulary now points at an SDK the package no
longer depends on.

## What it takes

A rename touching the `tool_use_id` column, so the plugin's migration baseline is
regenerated again — which makes every existing dev database unmigratable until
its ledger rows are cleared. `roadmap/completed/ai-capability.md` records that
recovery; do it in the same pass rather than discovering it twice.

Worth folding into the next change that already touches those tables, rather than
doing on its own.
