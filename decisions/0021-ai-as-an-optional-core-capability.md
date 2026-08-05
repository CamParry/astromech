# 0021 — AI as an optional core capability

**Date:** 2026-08-06
**Status:** accepted

Model access is `packages/astromech/src/ai/`, a capability sitting with `email/`
and `cron/` below the domains: absent unless a site configures it, available to
any domain or plugin once it is. This record is why it belongs to core rather
than to the plugin that asked for it first, why it is optional, and why its
config type is narrower than the AI SDK type it is built from.

## Why core rather than the assistant plugin

Before this, core had no AI in it and the assistant had all of it: a client, a
credential, a model id, and no way for anything else to reach any of them. A
second plugin wanting a model would have taken its own SDK dependency, its own
API key and its own model configuration, and a site running both would have
configured the same thing twice in two vocabularies.

Putting the seam in core makes that one credential, one config block and one
logging path. A second consumer costs a few lines — `getModel('whatever')` and a
branch on `undefined` — instead of a parallel stack. That is the whole argument,
and it is the same argument `email/` already won.

Keeping it in the plugin was rejected on reachability. A plugin may import
`astromech` and `astromech/ui` and nothing else from core
(`decisions/0007-plugin-core-boundary.md`), so anything the assistant owns is
unreachable by every other plugin by construction. The model seam is not
assistant-shaped; the assistant is just the first thing that needed it.

## Why optional

Core does not need a model to run. A site with no `ai` block boots, serves,
migrates and publishes exactly as before, so making the block required would
charge every install for a feature most of them don't want.

The registry is `required: false` and reads go through `peek`, so `getModel`
returns `undefined` rather than throwing, and a consumer branches on that to
disable its feature. The assistant's chat route is the worked example: no model
configured is a 503 naming what to add, not a failure mid-turn.

`buildAIConfig` imports `ai` dynamically for the same reason. A site that
configures nothing never pulls the package into its module graph.

## The config type is not `LanguageModel`

`AIConfig.model` is `Exclude<LanguageModel, string>`, exported as
`ModelInstance`. AI SDK's `LanguageModel` is a union of a provider model
instance and a bare string, and the string form is a gateway model id resolved
later by the SDK.

Accepting the string looks generous and isn't. `wrapLanguageModel` cannot wrap a
string, so a site that passed one would get a model back that core's middleware
had never touched — the chokepoint
`decisions/0022-core-hands-out-a-model.md` is built around, silently absent for
one configuration shape and present for the other. A type error at
config time is a better outcome than a class of installs where the wrap does not
apply and nothing says so.

The cost is that a site wanting the gateway installs the gateway provider and
calls it, rather than writing a string. That is one import.

## The model reaches the runtime through `initRuntime`

`config.ai.model` holds a live object with methods on it. It is set from
`initRuntime`'s `AstromechConfig` argument, alongside `config.email.driver` and
`config.storage`, and is stripped from `ResolvedConfig`.

It has to be. `virtual:astromech/config` is JSON, and a model serialised through
JSON arrives as `{}` — a value that type-checks nowhere useful and fails at the
first call. This is the same trap recorded for functions in
`astromech.config.ts`, and the rule is the same: anything with behaviour on it
travels through boot, never through the virtual config.
