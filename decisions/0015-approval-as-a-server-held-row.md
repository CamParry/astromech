# 0015 — An approval is a row the server holds, not a value in the transcript

**Date:** 2026-08-04
**Status:** accepted

The authoring assistant can pause a mutating call and ask the user before it
runs. The answer is a row in `plugin_authoring_approvals`, claimed by user id;
the call then executes with the arguments stored on that row. This record is why
the mechanism that already existed could not be reused, and why the gate holds
state when the rest of the tool surface deliberately does not.

## Why not the confirmation gate

`policies/confirmation.ts` already turns a mutating call back with
`input_required` and a question to put to a human. Wiring the drawer through it
looked like the whole job, and it is not one, because of where it sits.

The check runs at dispatch, inside the tool loop. A refusal reaches the model as
a tool result, so the model is what reads the question, and the model is what
answers it — on the retry it writes `_confirm: { action: 'accept' }` itself and
the call proceeds. The user's "yes" never leaves the chat transcript. That module
says so in its own docblock: it is a brake on a runaway loop, not a boundary, and
`scopedServices` is the boundary.

The axis is not stateless against stateful. It is which channel the answer
arrives on. An answer that travels back through the same party that asked proves
a round trip happened and nothing else.

## What makes the row different

The approval is not stored because state is wanted. It is stored because the
arguments have to live somewhere the requester cannot reach.

When a turn pauses, each mutating call gets a row holding the acting user, the
API-minted `tool_use` id, the method, and the concrete arguments. The response
carries the row ids. Approval arrives as a separate HTTP request, authenticated
by the session, naming those ids. The server reads the arguments off the row and
invokes with those — never with the arguments in the posted conversation.

So a client that rewrites the transcript it posts back changes what the model
believes happened. It does not change what runs.

Claiming and answering a row are one conditional UPDATE, matching on the row
being this user's, still pending, and unexpired. A second request carrying the
same decision updates nothing and runs nothing. The arguments are dropped in that
same statement: an update carries field values that may be `private: true`, while
the method, target, decision, who and when are what an audit question actually
needs and cost nothing to keep. A crash between winning a row and running its
call loses the call, which is the right way round — a write that did not happen
beats a delete that happened twice.

## Rejected: signing the paused turn

An HMAC over the pending call ids and their arguments, returned to the client and
required back, needs no table and no migration, and it does stop the arguments
being edited between pause and resume.

It stops less than it appears to. The signature travels with the thing it
protects, so it proves the server issued that turn, not that this request is the
first to replay it — closing double execution needs server-side state again.
Historical `tool_result` content stays forgeable unless every emitted turn is
signed, which is a larger change than the table. And it needs a secret sourced
from somewhere, for a mechanism that answers a narrower question than the row
does.

## Rejected: accepting the weaker boundary

Documenting the gap was defensible. The drawer is authenticated as the user, so a
forged approval only permits what that user's own role already permits through
the API directly; the sharper risk is forged results lying to the model, and that
harms only the conversation it happens in.

It was rejected because the same row that closes it is the record P10 needs, and
because the audit question — did a human agree to this write — cannot be answered
later from a transcript the client holds. Building the table once serves both.

## Naming

The event is `approval-required` and the type is `ApprovalRequest`, not `confirm`
and `ConfirmRequest`. Core exports a differently shaped `ConfirmRequest` from the
gate above, and the entire point of this work is that the two are not the same
mechanism; a shared name would hand the reader the wrong model of both.
`TERMINOLOGY.md` holds what each means today.

## Prior art

The AI SDK's `needsApproval` with `addToolApprovalResponse`, the Claude Agent
SDK's `canUseTool`, and MCP's `elicitation/create` all put the decision behind a
server-issued id resolved by a human action, never inside model-visible content.
MCP's specification goes furthest and requires the elicitation be bound to a
verified session rather than to anything the client asserts, which is what
claiming by user id does here.
