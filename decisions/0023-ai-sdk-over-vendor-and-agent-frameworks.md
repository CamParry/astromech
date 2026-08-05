# 0023 — AI SDK over the vendor SDK and over agent frameworks

**Date:** 2026-08-06
**Status:** accepted

The `ai` capability is built on Vercel's AI SDK: `ai` for `wrapLanguageModel`
and the generation functions, `@ai-sdk/provider` for the model type, and a
provider package per model a site configures. This record is what it beat.

## Rejected: staying on `@anthropic-ai/sdk`

The assistant already had a working Anthropic client, and keeping it would have
cost nothing on the day.

It is the wrong shape for a capability. A core seam that hands out Anthropic
specifically is a seam a site cannot point at OpenAI, a local model, or whatever
it already pays for, and the first thing anyone asks of an `ai` config block is
to put their own provider in it. The vendor SDK also has no equivalent of
`wrapLanguageModel`, so the chokepoint in
`decisions/0022-core-hands-out-a-model.md` would have had to be hand-built and
would have applied to one vendor.

## Rejected: LangChain JS and Mastra

Both are agent frameworks. They bring memory, retrieval, graph or workflow
execution, evaluation harnesses and their own runtime conventions, and they are
good at that.

That is the wrong altitude. What core needs is a configured model object with a
wrap point on it — the smallest possible thing that a plugin can be handed. An
agent framework asks the whole application to adopt its execution model, which
is a large commitment made on behalf of every site, to serve one plugin's chat
loop that already exists and works. A plugin that wants an agent framework can
still take one as its own dependency; nothing here prevents that, and that is
the level the choice belongs at.

## Rejected: LlamaIndex.TS

RAG-first. Its centre of gravity is indexing, chunking and retrieval over a
document corpus, none of which is what a model seam is for. Astromech's content
already lives in a queryable database with a permission model over it, so the
retrieval problem LlamaIndex solves is one this codebase answers with service
methods.

## The cost accepted

AI SDK moves fast: roughly three majors in a year, with breaking changes in
each. Taking it means taking that.

The mitigation is to keep AI SDK types out of the plugin-facing surface beyond
the model type itself. Core's config takes a model instance and core hands one
back; a major that reshapes `generateText`'s options touches the consumers that
call it, not the seam. It is not free — the model type has itself moved
versions — but it is a much smaller blast radius than an SDK type in every
plugin's options.

## The finding that qualifies the win

Provider-agnostic is a property of the seam, not of everything built on it.

The assistant sends hundreds of tools, so it depends on **tool search with
deferred loading** to keep the model's selection accurate. That is an Anthropic
provider tool — `anthropic.tools.toolSearchRegex_20251119()`, paired with
`providerOptions: { anthropic: { deferLoading: true } }` — and not a core AI SDK
feature. There is no provider-neutral spelling of it.

So the assistant still checks `model.provider` and refuses a non-Anthropic
model with a message saying why. That check is honest about what the plugin
needs, and it does not travel up into core: `getModel` will hand any configured
provider's model to any consumer, and the consumer states its own requirements.
Nothing about choosing AI SDK would have been improved by a wrapper of ours
here — the constraint is the provider's, not the library's.
