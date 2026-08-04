# 0013 — The chat transcript crosses the wire as content blocks

**Date:** 2026-08-04
**Status:** accepted

The assistant's transcript was `{ role, content: string }` in both directions.
It now carries Anthropic content blocks, and the drawer holds blocks it never
reads. This record is why the simpler shape could not survive.

## What forced it

A confirm gate has to pause a mutating `tool_use`, end the response, and resume
from a second request once the user has approved. Three API constraints make
that impossible over strings.

A `tool_use` block carries a server-minted id, and the matching `tool_result`
must lead the immediately-following user message. The id cannot be
reconstructed, so a paused call has to come back the way it left.

The sharper one is `thinking`. Opus 5 runs with thinking on by default and
`display` defaulting to `omitted`, so an assistant turn carries `thinking`
blocks whose text field is empty and whose `signature` is real. When a
`tool_use` follows, every `thinking` and `redacted_thinking` block must be
passed back unmodified and in the order generated, or the resume is rejected.
At `xhigh` and `max` effort thinking cannot be turned off, so no configuration
avoids this.

Those two together rule out a transcript that stores what the interface
renders. The drawer has nothing to show for an empty `thinking` block, and
dropping it would have produced a failure that appears only on a resumed tool
call against a real model — past every unit test, and past a single-turn
browser check. The transcript therefore carries blocks verbatim and filters
only at the point of rendering. There is now a test that round-trips
`thinking` + `tool_use` byte-for-byte, because that is the regression with no
other way to catch it.

## Rejected: a separate UI message type

The Vercel AI SDK splits `UIMessage` (rendered and persisted) from
`ModelMessage` (sent to the provider), converting between them. It is good
design and it solves a real problem: streaming states, approval states and
part ids have no place in the provider's format.

It was rejected here because our version of that problem is smaller than the
machinery. The states the split exists to carry — is this streaming, is this
awaiting approval — are per-request, not per-message. They live in the
drawer's own state, keyed by `tool_use` id, and are gone when the request
ends. Adopting the split would have meant a second message format, a
conversion in both directions, and a rule that every unrecognised block must
survive the trip — which is exactly the rule we get for free by not
converting at all.

The one thing the split does buy is a place to keep an error. That is handled
below without a parallel format.

## Rejected: our own block union

Declaring a local union of the blocks we understand would have kept the SDK's
types out of the browser bundle's type surface. It was rejected because it
inverts the property that matters: a hand-written union describes what we
model, and everything outside it gets dropped by construction. The blocks most
likely to fall outside it are the ones we must not drop. `BetaContentBlockParam`
is imported as a type and erased at build, so the cost it avoided was not real.

## Errors are not blocks

An error is not part of the conversation and must never be sent to the model,
but it should stay visible where it happened. So the drawer renders a list of
`{ kind: 'message' | 'error' }` entries and the request body is the messages
filtered out of that list. This is a much smaller version of the split rejected
above, and it is confined to the drawer.

## Consequences

Streaming text now arrives as `text-delta` for rendering only, and each
completed turn arrives as an authoritative `message` event carrying its blocks.
The event names follow the Vercel AI SDK's stream protocol rather than a
private vocabulary. The assistant turn comes from the runner's final message
and the tool-result turn from `generateToolResponse()`, which is memoised per
iteration — so calling it from the loop body runs each tool once, and it is
where the confirm gate will intercept.

Stopping mid-stream discards the partial text. Previously it stayed in the
transcript, visible but never posted back, which meant the interface showed
the user something the model had no memory of.

A client that holds the transcript can forge a `tool_result`. That is bounded
here: the drawer is authenticated as the signed-in user and every call is
re-checked through `scopedServices`, so a forged block can mislead the model
but cannot widen what the user may do. It is also the reason a confirm gate
cannot treat the posted transcript as evidence that anything was approved.
