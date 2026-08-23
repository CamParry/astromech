# 0018 — The assistant keeps one session per user, not a library of them

**Date:** 2026-08-04
**Status:** accepted

The authoring assistant persists exactly one conversation per user, replaced on new chat, so it survives reloads without a browsable session library (unbounded table, retention policy, cross-user disclosure question). "What did the assistant do to my site" is deferred to an audit trail at the `scopedServices` choke point instead; storing the acting role on the session row was rejected as a second source of truth and as theatre.
