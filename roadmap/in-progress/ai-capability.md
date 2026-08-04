# AI as an optional core capability

Model access becomes a core capability in the same shape as `email` and `cron`:
absent unless configured, available to any domain or plugin once it is. The
assistant plugin stops owning the API key and becomes a consumer. The `content`
domain, whose provider port nothing ever implemented, is removed.

The design is written up in full in the spec of the same name, which is deleted
when this ships. This file holds the work and the questions still open.

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

- [ ] **The `ai` capability.** `src/ai/` with a `required: false` registry, an
      `ai?: { model, models? }` config block, boot wiring through `initRuntime`'s
      live config, and a two-function surface (`getModel`, `hasModel`).
    - The model is a live object, so it reaches the registry through
      `initRuntime`, never through `virtual:astromech/config`, which is JSON and
      would strip it to `{}`.
    - `getModel` returns a model already wrapped with `wrapLanguageModel`, so
      what core applies cannot be opted out of.
    - **Logging only.** Spend limits belong in the provider's dashboard, which
      already has the billing relationship and the alerting.
- [ ] **`parseRichText`.** HTML → ProseMirror JSON via `linkedom`, alongside the
      existing `renderRichText`, both driven by `buildRichTextExtensions(allow)`
      so one schema governs both directions. Delete
      `fields/rich-text/segments.ts` and `fields/rich-text/markdown.ts`.
    - Round-trip tests must cover links with `target`/`rel`/`class`, nested
      lists, and marks that exclude others.
    - Unlocks HTML paste, editing rich text as HTML, and sending HTML to a
      non-model translation service. None of those are built here.
- [ ] **Rename the assistant plugin.** `@astromech/authoring` →
      `@astromech/assistant`. Its remaining job is a chat drawer; it can already
      manage users and settings, so "authoring" was never accurate.
    - Table names derive from the package, so `plugin_authoring_*` becomes
      `plugin_assistant_*`. Nothing is deployed, so **regenerate the baseline
      migration** rather than writing a rename migration.
- [ ] **Point the assistant at `getModel`.** Its options lose `model` and
      `apiKeyEnv`; `effort` and `readOnly` stay. It disables itself when no model
      is configured rather than failing mid-turn.
    - **Blocked on a real answer:** `AuthoringModel` restricts to four Claude ids
      because AI context reaches the model as `role: 'system'` entries inside
      `messages[]`, which unsupporting models silently demote to a top-level
      system block. A provider-agnostic model deletes the type that enforced
      that. Establish how AI SDK handles mid-array system messages per provider,
      or move AI context out of `messages[]`. The union disappearing is not the
      fix.
- [ ] **Remove `content/`.** The module, its HTTP router, its entry in the tool
      dispatch map and the method manifest, `scopeContent`, the three
      `content:*` permissions and the `editor` grants, the four `Content*` types,
      and the tests.
    - `ARCHITECTURE.md` loses the directory-map line and the layer-model entry.
      This dissolves the only downstream-domain exception the layer model has.
    - `roadmap/planned/naming-open-questions.md` loses its `content/ → ?`
      section, which this answers by deletion.
- [ ] **Docs.** Decision records for the capability, the two-function surface,
      the library choice, the removal, the HTML interchange format and the
      rename. A `TERMINOLOGY.md` entry for the capability. A user-facing page on
      configuring `ai`.
    - P11 in `roadmap/in-progress/ai-integration.md` pairs an off-topic refusal
      with "a spend or rate cap". The refusal stays, the cap does not.

## Order

Nothing is deleted before its replacement exists. The capability and
`parseRichText` are independent and can be written in parallel; the rename and
the rewiring are sequential; the removal is last.

## Next, once this ships

**Evaluate `ToolLoopAgent` as a replacement for the hand-written loop.** AI SDK
v7 ships one with built-in tool approvals, which overlaps
`decisions/0020-approval-as-a-server-held-row.md`.

The question is not whether it works but whether it has the property that record
was written for: the approval is a server-held row, claimed and answered in one
conditional update, and the call executes with the **row's** arguments rather
than the transcript's, so a model cannot forge its own approval. An in-transcript
or client-driven approval does not have that. Read the implementation rather than
the documentation.

Also confirm before migrating: tool search with deferred loading, and
thinking-block round-tripping (an open report of lost reasoning signatures across
multi-step tool calls is filed against two majors back, unverified on v7).

## Open

- **Where model-call logs land.** The middleware logs through the plugin logger
  path. Whether they also belong in the audit trail P10 is designing is a P10
  question, but two records of one call that can disagree is the outcome to
  avoid.
- **Naming named models.** `getModel('assistant')` takes a bare string. Whether
  named models need a registration convention, so two plugins do not both claim
  one name meaning different things, is easier to decide before a second
  consumer exists than after.
- **What replaces the content operations, and when.** Deliberately unanswered
  here. Two properties carry forward when they return: the operation owns the
  read, the field selection, the placement and the write, so entry data never
  round-trips through a model's context as something it must reconstruct; and
  the result lands staged or unpublished, never published. The permission
  question has a lean, not an answer: probably not their own namespace, folding
  into the target type's `update`, which would retire the double permission gate.
