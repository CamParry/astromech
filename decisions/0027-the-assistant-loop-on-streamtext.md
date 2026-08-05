# 0027 — The assistant's loop runs on `streamText`, and keeps its own approval gate

**Date:** 2026-08-06
**Status:** accepted

The assistant's server-side loop moved from `@anthropic-ai/sdk`'s tool runner to
AI SDK's `streamText`. It keeps the approval gate
`decisions/0020-approval-as-a-server-held-row.md` describes and does not use AI
SDK's own. This record is why the move was forced, why the built-in approvals
were refused, what mechanism replaced them, and two smaller calls that came with
it.

## Why the loop had to move at all

The plugin now gets its model from `getModel('assistant')`, and what comes back
is a `LanguageModelV4` instance. That is neither an API key nor a model id, and
the Anthropic tool runner needs both. There was no version of this where the
plugin consumes the core capability and keeps the old runner, so the two changes
are one change.

## Rejected: AI SDK's built-in tool approvals

AI SDK v7 ships tool approvals — `needsApproval`, `addToolApprovalResponse`, and
policy-based variants — and on the surface they solve exactly this problem. They
were read before being rejected, and the rejection is about where the approved
arguments come from.

`collect-tool-approvals.ts` resolves an approval by walking the message history
the client posted and re-reading the call's arguments out of it. That is the
design `decisions/0020` exists to reject: the arguments that execute are
supplied by the party asking for permission, so editing the transcript between
the question and the answer changes what runs.

`experimental_toolApprovalSecret` is the answer to that objection and it closes
less than it looks like it does. It HMACs a canonical hash of the call's input,
so the arguments cannot be edited without invalidating the signature. But the
signature travels with the thing it protects, which means it proves the server
issued that call — not that this is the first time it has been presented. There
is no replay protection and no binding to the acting user, so a captured
approved turn can be posted again, and by someone else. This is the same
argument `decisions/0020` made against signing the paused turn, and the same
conclusion follows: closing double execution needs server-side state, and once
there is a row, the row may as well hold the arguments.

## What replaced them: a tool with no `execute`

A mutating tool is declared with **no `execute` function**. AI SDK documents
that as a loop-halt condition: the step ends, nothing runs the call, and the
generation stops there rather than continuing to the next step.

That halt is the gate. The turn stops with nothing mutating executed, the
unexecuted calls are read off the finished steps, and one approval row is minted
per call holding the acting user, the call id, the method and the concrete
arguments. When the decision comes back on a later request, `resultFor` invokes
the tool with **the row's arguments**, never the posted call's input. The
property `decisions/0020` was written for is unchanged; only the thing producing
the halt is different.

Placing the gate at the loop's own stopping point rather than in front of a
dispatcher has one visible consequence. A step that mixes read-only and mutating
calls runs the read-only ones and halts on the rest, so a paused turn may
already be followed by a tool message carrying part of its answer.
`pausedToolCalls` reconciles against that instead of assuming the assistant turn
is last — a case the old runner could not produce, because it refused the whole
step.

## `smoothStream` is banned in the loop

AI SDK's `smoothStream` transform makes streamed text arrive word by word
instead of in provider-sized chunks, and it is the obvious thing to reach for on
a chat drawer. The loop must not use it, and the call site says so.

Two facts combine badly. It drops a reasoning part's `providerMetadata`, which
is where the signature Anthropic requires on a resubmitted thinking block lives.
And it runs upstream of the recorder that builds `response.messages`, which is
what the loop stores as the transcript. So the loss does not degrade one
response; it is written to the session row, and every later request resuming
that conversation fails on a thinking block whose signature is gone.

A cosmetic transform that corrupts stored state is not a trade worth taking for
smoother text.

## The four-id model union is deleted

The plugin used to restrict its model to four Claude ids. The reason was real:
AI context travels as a `role: 'system'` message part-way through `messages[]`,
and a provider that does not support a system message in that position demotes
it to a top-level system block silently — a quiet wrong answer rather than an
error.

`@ai-sdk/anthropic` keeps a later system block inline where it was placed and
sends the `mid-conversation-system-2026-04-07` beta header itself, so the
behaviour the union was protecting is genuinely supported and no longer needs a
list to enforce it. What replaces the union is a check on `model.provider`,
which is the actual requirement — the assistant also needs Anthropic's tool
search, per `decisions/0023-ai-sdk-over-vendor-and-agent-frameworks.md`.

Beyond being redundant, the union was a maintenance trap. An id list goes stale
the day a new model ships, and its failure mode is refusing a model that works.
A provider check cannot go stale that way.
