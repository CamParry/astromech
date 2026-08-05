# AI as an optional core capability

Model access becomes a core capability in the same shape as `email` and `cron`:
absent unless configured, available to any domain or plugin once it is. The
assistant plugin stops owning the API key and becomes a consumer. The `content`
domain, whose provider port nothing ever implemented, is removed.

Built on `feat/ai-capability`. The rationale and the rejected alternatives are
in `decisions/0021-ai-as-an-optional-core-capability.md` through
`decisions/0027-the-assistant-loop-on-streamtext.md`; this file holds the work
and the questions still open.

## Why now

Core has no AI in it and the assistant has all of it, so a second plugin wanting
a model would take its own SDK dependency, its own API key and its own model
config. That is the cost this removes: one credential, one config block, one
logging path, and a new consumer writes a few lines.

`content/` is deleted rather than rewired. It is three operations whose port
nothing implements, exposed as tools the assistant can discover and call, which
fail at runtime. There is no UI for them yet, and the UI shape determines the
operation shape.

## What this needs

- [x] **The `ai` capability.** `src/ai/` with a `required: false` registry, an
      `ai?: { model, models? }` config block, boot wiring through `initRuntime`'s
      live config, and a two-function surface (`getModel`, `hasModel`).
    - The model is a live object, so it reaches the registry through
      `initRuntime`, never through `virtual:astromech/config`, which is JSON and
      would strip it to `{}`.
    - `getModel` returns a model already wrapped with `wrapLanguageModel`, so
      what core applies cannot be opted out of.
    - **Logging only.** Spend limits belong in the provider's dashboard, which
      already has the billing relationship and the alerting.
    - Landed with the config type narrowed to `Exclude<LanguageModel, string>`:
      the bare-string form is a gateway model id, and `wrapLanguageModel` cannot
      wrap a string, so accepting it would hand out an unwrapped model.
- [x] **`parseRichText`.** HTML → ProseMirror JSON via `linkedom`, alongside the
      existing `renderRichText`, both driven by `buildRichTextExtensions(allow)`
      so one schema governs both directions. Delete
      `fields/rich-text/segments.ts` and `fields/rich-text/markdown.ts`.
    - Round-trip tests must cover links with `target`/`rel`/`class`, nested
      lists, and marks that exclude others.
    - Unlocks HTML paste, editing rich text as HTML, and sending HTML to a
      non-model translation service. None of those are built here.
- [x] **Rename the assistant plugin.** `@astromech/authoring` →
      `@astromech/assistant`. Its remaining job is a chat drawer; it can already
      manage users and settings, so "authoring" was never accurate.
    - Table names derive from the package, so `plugin_authoring_*` becomes
      `plugin_assistant_*`. Nothing is deployed, so **regenerate the baseline
      migration** rather than writing a rename migration.
- [x] **Point the assistant at `getModel`.** Its options lose `model` and
      `apiKeyEnv`; `effort` and `readOnly` stay. It disables itself when no model
      is configured rather than failing mid-turn.
    - **The model-union question was answered, not dropped.** `AuthoringModel`
      restricted to four Claude ids because AI context reaches the model as
      `role: 'system'` entries inside `messages[]`, which unsupporting models
      silently demote. `@ai-sdk/anthropic` keeps a later system block inline and
      sends the `mid-conversation-system-2026-04-07` beta itself, so the
      guarantee is real and a `model.provider` check enforces it — one that
      cannot go stale as models ship.
    - Consuming a `LanguageModel` meant the loop had to move off
      `@anthropic-ai/sdk`'s tool runner onto `streamText`. That is the largest
      piece of this work, and `decisions/0027-the-assistant-loop-on-streamtext.md`
      holds it: why AI SDK's own tool approvals were refused, and the `execute`-less
      tool that halts the loop in their place.
- [x] **Remove `content/`.** The module, its HTTP router, its entry in the tool
      dispatch map and the method manifest, `scopeContent`, the three
      `content:*` permissions and the `editor` grants, the four `Content*` types,
      and the tests.
    - `ARCHITECTURE.md` loses the directory-map line and the layer-model entry.
      This dissolves the only downstream-domain exception the layer model has.
    - `roadmap/planned/naming-open-questions.md` loses its `content/ → ?`
      section, which this answers by deletion.
- [x] **Docs.** Decision records `0021`–`0027`, a `TERMINOLOGY.md` entry for the
      capability, and `apps/docs/configuration/ai.md`. The seventh record covers
      the loop rewrite, which was not foreseen when this list was written.
    - P11 in `roadmap/in-progress/ai-integration.md` paired an off-topic refusal
      with "a spend or rate cap". The refusal stays; the cap is now a recorded
      no.

## Order

Nothing is deleted before its replacement exists. The capability and
`parseRichText` are independent and can be written in parallel; the rename and
the rewiring are sequential; the removal is last.

## The `ToolLoopAgent` evaluation, and what it decided

This list originally deferred the loop to a follow-up: evaluate AI SDK v7's
`ToolLoopAgent` and its built-in tool approvals, and read the implementation
rather than the documentation. Consuming a core-supplied `LanguageModel` pulled
that forward into this work, and the reading was done.

**The answer was to rewrite the loop onto `streamText` and keep our own approval
gate.** AI SDK's approvals resolve a call's arguments by re-reading the
client-posted message history, which is the design
`decisions/0020-approval-as-a-server-held-row.md` rejected, and
`experimental_toolApprovalSecret` proves issuance rather than first use. What
replaced them is a mutating tool declared with no `execute`, a documented
loop-halt: the turn stops with nothing mutating run, rows are minted from the
unexecuted calls, and the call still executes with the row's arguments.
`decisions/0027-the-assistant-loop-on-streamtext.md` has the full reasoning, plus
the `smoothStream` ban and the deleted model union.

The two things to confirm before migrating both resolved. Tool search with
deferred loading works and is what the assistant relies on, at the cost of a
provider check — it is an Anthropic provider tool, not a core AI SDK feature.
Thinking-block round-tripping holds as long as a reasoning part's
`providerMetadata` survives, which is exactly what `smoothStream` destroys.

## Open

- **Where model-call logs land.** The middleware writes one console line per
  completed call, tagged `[astromech:ai]`. Whether they also belong in the audit
  trail P10 is designing is a P10 question, but two records of one call that can
  disagree is the outcome to avoid. A cancelled or failed stream logs nothing,
  because `TransformStream.flush()` never runs.
- **Naming named models.** `getModel('assistant')` takes a bare string. Whether
  named models need a registration convention, so two plugins do not both claim
  one name meaning different things, is easier to decide before a second
  consumer exists than after.
- **What replaces the content operations, and when.** Still unanswered, and
  waiting on a UI design rather than on an implementation.
  `decisions/0024-removing-the-content-operations.md` holds the two properties
  that must carry forward and the open permission question, so this is a pointer
  and not a restatement.
