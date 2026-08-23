# 0020 — An approval is a row the server holds, not a value in the transcript

**Date:** 2026-08-04
**Status:** accepted

A mutating assistant call pauses into a row in `plugin_authoring_approvals` (user id, `tool_use` id, method, arguments), approved by a separate authenticated request and executed from the row's stored arguments, so a rewritten transcript cannot change what runs. Rejected reusing `policies/confirmation.ts` (the model answers its own question) and HMAC-signing the paused turn (no replay protection without server state).
