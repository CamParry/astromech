# 0022 — Core hands out a model; it does not wrap generation

**Date:** 2026-08-06
**Status:** accepted

The whole public surface of the `ai` capability is two functions:

```ts
export function getModel(name?: string): LanguageModelV4 | undefined;
export function hasModel(name?: string): boolean;
```

Consumers import `generateText`, `streamText` or `Output.object` from the AI SDK
themselves and call the model they were handed. Core owns which model, and what
wraps it; it owns nothing about how a call is shaped.

## Rejected: a `rewrite`-style facade

The obvious alternative is a core function that takes a job and returns a
result — `rewrite(text, instruction)`, or a small family of them — so a consumer
never touches the SDK.

That is precisely what the removed `ContentProvider` port was, and it is why it
failed. `rewrite()` was shaped by its first and only intended caller, so its
signature encoded translate's assumptions: one text in, one text out, no tools,
no streaming, no structured output, no images. Anything that wasn't translate
either didn't fit or forced the signature wider until it stopped constraining
anything.

The generalisation is not about that one function. A facade is useful in
proportion to how much it decides for you, and everything it decides is
something a second consumer may need decided differently. Narrow enough to help
means narrow enough to be wrong for the next caller, and wide enough to suit
every caller is the SDK's own surface with a worse name on it.

## Rejected: a second provider-agnostic layer

Wrapping AI SDK in an Astromech-shaped abstraction so providers stay swappable
answers a question that is already answered. Provider-agnosticism is what AI SDK
is; `@ai-sdk/anthropic`, `@ai-sdk/openai` and the rest exist to make a model
instance interchangeable, and re-wrapping them buys a second vocabulary to
learn, a lag behind every SDK feature, and no property the layer beneath doesn't
already have.

The exception that proves the shape is recorded in
`decisions/0023-ai-sdk-over-vendor-and-agent-frameworks.md`: where AI SDK is
genuinely not provider-agnostic, a wrapper of ours would not have made it so.

## The chokepoint objection, and the answer

Handing out a raw model looks like giving up the one place a site could enforce
something across every model call.

It isn't, because what `getModel` hands back is already wrapped. Every
configured model goes through `wrapLanguageModel` at boot and the registry
stores the wrapped instance, so a consumer holds a model that runs core's
middleware and has no way to ask for one that doesn't. Nothing about a call
shape is dictated, and every call still passes through one point.

Day one is logging only: one line per call with the configured name, the
provider and model id, the operation, the duration and the token usage. The
middleware slot is where a later policy would go if one is wanted.

## Spend limits belong in the provider's dashboard

They are out of scope here, deliberately, and this is recorded so it isn't
re-derived every time someone reads the middleware and notices the gap.

Anthropic and OpenAI already have the billing relationship, aggregation across
every key and surface, and alerting. A cap implemented in the middleware would
need durable shared state, which a Worker does not have, so it would mean a
table, a write per call, contention on it, and a decision about what happens
when the write fails. That is real complexity for a worse version of something
the provider gives away, and it would still miss spend from anything not going
through this seam.

## What the log does not record

`wrapStream` counts a call by piping the model's stream through a
`TransformStream` and logging from `flush()`. `flush()` does not run when a
stream is cancelled or errors. So the log records **completed calls, not
attempted ones**: an aborted request or a provider failure mid-stream leaves no
line.

That is the honest limit of a per-call log line, and it is acceptable for
logging. It would not be acceptable for anything counting spend, which is a
second reason the previous section holds.
