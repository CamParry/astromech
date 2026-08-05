# AI

Model access is one optional config block. Add `ai` and every plugin that wants
a model can reach one; leave it out and nothing breaks, the features that need a
model just stay off.

```ts
import { defineConfig } from 'astromech';
import { anthropic } from '@ai-sdk/anthropic';

export default defineConfig({
    ai: {
        model: anthropic('claude-opus-5'),
    },
    // …
});
```

## Install a provider package

Astromech uses the [AI SDK](https://ai-sdk.dev), so the provider package is
whichever one you want to call. Install it in your site, not in Astromech:

```sh
npm install @ai-sdk/anthropic   # or @ai-sdk/openai, @ai-sdk/google, …
```

Then call it with a model id to get a model instance. Every AI SDK provider
works the same way:

```ts
anthropic('claude-opus-5');
openai('gpt-5');
```

API keys are the provider's business, not Astromech's. `anthropic()` reads
`ANTHROPIC_API_KEY` from the environment, `openai()` reads `OPENAI_API_KEY`, and
each takes explicit options if you'd rather pass the key yourself. Nothing in
the `ai` block holds a credential.

**`model` takes a model instance, not a string.** A bare string is an AI SDK
gateway model id, which Astromech can't wrap with its own middleware, so it's a
type error rather than a silently different code path. If you want the gateway,
install `@ai-sdk/gateway` and call it like any other provider.

## `model` and named `models`

`model` is what a consumer gets when it asks for no model in particular.
`models` is a record of named alternatives — a cheap model for bulk work, a
vision model, a big model for one plugin that needs it:

```ts
ai: {
    model: anthropic('claude-sonnet-4-5'),
    models: {
        assistant: anthropic('claude-opus-5'),
        bulk: anthropic('claude-haiku-4-5'),
    },
},
```

A name that isn't in `models` falls back to `model`, so you only name the ones
you want to differ. Adding `models` without `model` isn't possible: `model` is
required whenever the block is present.

The demo configures the same model twice, which is the shape to copy when you
haven't got a reason to split them yet:

```ts
// apps/demo/astromech.config.ts
ai: {
    model: anthropic('claude-opus-5'),
    models: { assistant: anthropic('claude-opus-5') },
},
```

## Reaching the model from your own code

```ts
import { getModel, hasModel } from 'astromech';
import { generateText } from 'ai';

const model = getModel('my-plugin');
if (model === undefined) return; // no `ai` block — the feature is off

const { text } = await generateText({ model, prompt: '…' });
```

`getModel(name?)` returns the named model, falls back to `model`, and returns
`undefined` when there's no `ai` block at all. Branch on `undefined` to disable
your feature — it never throws. `hasModel(name?)` answers the same question
without handing you the instance, for a check that only decides whether to
render something.

Generation itself is the AI SDK's: import `generateText`, `streamText` or
`Output.object` from `ai` and pass the model you were given. Astromech doesn't
wrap those — `decisions/0022-core-hands-out-a-model.md` records why.

Every model handed out this way logs one line per completed call — the name, the
provider and model id, the duration and the token usage.

## What `@astromech/assistant` needs

The assistant asks for `getModel('assistant')`, so either register one under
that name in `models` or let it fall back to `model`.

**It requires an Anthropic model.** The assistant sends the whole method
manifest as tools and relies on Anthropic's server-side tool search with
deferred loading to keep them findable, and that has no equivalent on other
providers. A model from anywhere else gets a 503 from the chat route naming the
provider you configured. Configuring no model at all gets a 503 too, rather than
a failure part-way through a conversation.

Everything else about the plugin — reasoning effort, whether mutating methods
appear on the tool surface at all — stays in `assistant()`'s own options.
