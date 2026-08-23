# 0027 — The assistant's loop runs on `streamText`, and keeps its own approval gate

**Date:** 2026-08-06
**Status:** accepted

Assistant loop moved from Anthropic SDK's tool runner to AI SDK `streamText` (forced by `getModel('assistant')` returning a `LanguageModelV4`), keeping its own approval rows; rejected AI SDK's built-in tool approvals because approved arguments are re-read from client-posted history and `experimental_toolApprovalSecret` gives no replay protection or user binding. A mutating tool declares no `execute`, and that loop halt is the gate. `smoothStream` is banned (drops reasoning `providerMetadata` into the stored transcript); the four-Claude-id model union is replaced by a `model.provider` check.
