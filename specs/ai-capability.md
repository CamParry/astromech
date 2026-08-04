# AI as an optional core capability

**Status:** designed, not started. Supersedes the `content/` domain, which is
removed by this work.
**Touches:** new `packages/astromech/src/ai/`, removal of
`packages/astromech/src/content/`, `packages/astromech/src/boot/boot.ts`,
`packages/astromech/src/types/config.ts`, `packages/astromech/src/permissions/index.ts`,
`packages/astromech/src/policies/scoped-services.ts`,
`packages/astromech/src/codegen/method-manifest.ts`,
`packages/astromech/src/transport/{http,local,tools}/`,
`packages/astromech/src/fields/rich-text/`, `packages/plugins/authoring/` (renamed),
`apps/demo/astromech.config.ts`.
**Related memories:** `plugin-core-module-boundary.md`,
`config-functions-json-stripped.md`, `project_richtext_storage.md`,
`project_ai_integration_inflight.md`.

---

## 1. What this changes and why

Core today has no AI in it. It has `content/`, a domain declaring a
`ContentProvider` port that nothing implements, and the assistant plugin has a
complete Anthropic client that nothing else can reach. Neither half is usable by
a third party.

This work makes model access an **optional core capability** in the same shape as
`email/` and `cron/`: absent unless configured, available to any domain or plugin
once it is. The assistant becomes a consumer of it rather than the owner of it, so
a second plugin wanting a model writes a few lines instead of taking its own SDK
dependency, its own API key and its own model configuration.

The `content/` domain is deleted rather than rewired. Its rationale is preserved
in a decision record so it can be rebuilt once the UI question has an answer.

Rationale that must outlive this file goes to `decisions/` (§9). Nothing durable
may link here.

## 2. The capability

### 2.1 Location and name

`packages/astromech/src/ai/`, a capability sitting with `email/` and `cron/` in
the layer model, below domains.

`ai` reads against `types/ai-context.ts`, `utilities/ai-context.ts` and the
`TERMINOLOGY.md` "AI context" entry, which name a different thing (what the admin
tells a model about where the user is). This is a layering distinction, not a
collision: `ai/` is model access, AI context is one input that may travel through
it. Neither is renamed. `models/` was rejected because "modelling content" is
already how `ARCHITECTURE.md` describes schema design; `llm/` was rejected as
jargon that ages badly.

### 2.2 Files

```
src/ai/
  index.ts       # getModel, hasModel — the whole public surface
  registry.ts    # createRegistry<AIConfig>('ai', { required: false })
  middleware.ts  # the wrap applied at boot
```

### 2.3 Config

Added to `AstromechConfig` in `types/config.ts`, beside `email`:

```ts
ai?: {
    /** The model used when a consumer asks for no name in particular. */
    model: LanguageModel;
    /** Named alternatives — a cheap model for bulk work, a vision model, … */
    models?: Record<string, LanguageModel>;
};
```

`LanguageModel` is the AI SDK type. A site writes `anthropic('claude-opus-5')`,
`openai('gpt-5')`, or any other AI SDK provider.

This carries live objects, so it must reach the registry through `initRuntime`'s
`AstromechConfig` argument, exactly as `config.email.driver` and `config.storage`
do. It must **never** be read from `virtual:astromech/config` at request time,
which is JSON and would strip the model to an empty object.

### 2.4 Surface

```ts
export function getModel(name?: string): LanguageModel | undefined;
export function hasModel(name?: string): boolean;
```

That is deliberately the entire surface. Core hands out a configured model and
does not wrap generation. Consumers import `generateText`, `Output.object()`,
`streamText` or `ToolLoopAgent` from `ai` directly.

`getModel(name)` returns the named model, falling back to `model` when the name
is not configured, and `undefined` when nothing is configured at all. Consumers
branch on `undefined` to disable their feature rather than throwing, which is why
the registry is `required: false` and reads use `peek`.

Not wrapping the SDK is the central call, and §9 records why: `ContentProvider.rewrite()`
failed because it was shaped by its first consumer, and any facade narrow enough
to be useful repeats that. AI SDK is already the provider-agnostic layer.

### 2.5 Middleware

`getModel()` returns a model already wrapped with `wrapLanguageModel`, so
consumers cannot opt out of what core applies. This is what preserves a single
chokepoint without core owning a generation API.

**Day one: logging only.** Every call logs model id, consumer, token usage and
duration through the existing plugin logger path.

**Spend limits are explicitly out of scope.** They belong in the Anthropic or
OpenAI dashboard, which already has the billing relationship, the aggregation and
the alerting. Implementing a counter in a Worker with no shared memory is real
complexity for a worse version of something the provider gives away. Record this
in `decisions/` so it is not re-derived.

`P11` in `roadmap/in-progress/ai-integration.md` currently pairs an off-topic
refusal with "a spend or rate cap". That pairing needs updating: the refusal
stays, the cap does not.

### 2.6 Boot

In `initRuntime`, beside the `config.email` branch:

```ts
if (config.ai) {
    setAIConfig(await buildAIConfig(config.ai));
}
```

`buildAIConfig` dynamically imports `ai` so the package is not pulled into the
module graph of a site that has not configured a model. Core takes `ai` as a
dependency for the `LanguageModel` type and `wrapLanguageModel`; the dynamic
import keeps the runtime cost at zero when unused.

## 3. The assistant plugin

### 3.1 Rename

`@astromech/authoring` → `@astromech/assistant`. The plugin's remaining job is a
chat drawer; its slot component is already `assistant-button.tsx` and its own
header already calls it an assistant. "Authoring" was never accurate (it can
manage users and settings) and becomes less so once the model seam leaves.

The rename is not cosmetic. `definePluginTable` derives table names from the
package as a type, so `plugin_authoring_approvals` and `plugin_authoring_sessions`
become `plugin_assistant_*`. Nothing is deployed anywhere, so **regenerate the
baseline migration rather than writing a rename migration.** `migrations/0000_baseline.ts`
and `migrations/0001_add-sessions.ts` collapse into one new baseline.

`AUTHORING_PACKAGE`, `AuthoringOptions`, `ResolvedAuthoringOptions`,
`runAuthoringLoop` and `authoringPermissions` rename with it. `apps/demo/astromech.config.ts`
imports and the `authoring.permissions('use')` role grant follow.

### 3.2 Consuming the capability

`resolveOptions` loses `model` and `apiKeyEnv`. The plugin calls
`getModel('assistant')` and disables itself when it returns `undefined`, so a site
that installs the plugin without configuring `ai` gets a clear absence rather than
a runtime error mid-turn.

`effort` and `readOnly` stay: both are the plugin's own concern.

### 3.3 The loop stays, for now

The Anthropic beta tool runner in `loop/run.ts` is unchanged by this work. It
keeps `@anthropic-ai/sdk` as a direct dependency alongside the core-supplied
model until step two (§8) decides whether `ToolLoopAgent` can replace it.

This means the plugin briefly has two paths to a model. That is intentional: the
seam and the loop are separate changes, and swapping both at once makes any
regression ambiguous.

### 3.4 Risk the rename surfaces

`types.ts` restricts `AuthoringModel` to four Claude ids for a documented reason:
AI context reaches the model as `role: 'system'` entries inside `messages[]`, and
models that do not support that silently demote them to a top-level system block,
turning a hard failure into a quiet wrong answer.

A provider-agnostic `LanguageModel` deletes the type that enforced this. Before
the plugin accepts an arbitrary configured model, establish how AI SDK's message
model handles mid-array system messages across providers, and if the guarantee
cannot be re-established, move AI context out of `messages[]` rather than
accepting silent demotion. **Do not treat this as covered by the type union
disappearing.**

## 4. Removing `content/`

Delete `packages/astromech/src/content/` entirely (`index.ts`, `service.ts`,
`methods.ts`, `provider.ts`, `errors.ts`, `internal/eligibility.ts`,
`internal/batch.ts`).

Wiring to remove, all verified present:

| File                                   | What goes                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/transport/http/index.ts`          | the `contentRouter` import and `app.route('/content', …)`                          |
| `src/transport/http/routes/content.ts` | whole file                                                                         |
| `src/transport/local/index.ts`         | the `ContentService` intersection on `Astromech` and its import                    |
| `src/transport/tools/dispatch.ts`      | the `content` entry in the service map                                             |
| `src/codegen/method-manifest.ts`       | the `contentContract` import and its `['content', …]` entry                        |
| `src/policies/scoped-services.ts`      | `scopeContent`, the `content` key on the scoped bundle                             |
| `src/permissions/index.ts`             | the three `content:*` descriptors and the `editor` role's grants                   |
| `src/types/services.ts`                | `ContentService`, `ContentTarget`, `ContentOperationResult`, `ContentFieldSummary` |

Tests to delete: `tests/content/` (five files) and
`tests/transport/http/routes/content-mounted.test.ts`. `tests/_support/fake-content-provider.ts`
goes with them. `tests/policies/scoped-services.test.ts` loses its content cases.

`ARCHITECTURE.md` loses the `content/` line from the directory map, the `content ·`
entry from the layer model, and the parenthetical "(content is downstream: it may
import entries)". `ai/` is added to the capabilities block. The layer model gains
nothing else: removing this dissolves the only downstream-domain exception it had.

`roadmap/planned/naming-open-questions.md` loses its `content/ → ?` section, which
this work answers by deletion.

The three permission keys leaving means `editor` no longer grants them. No
migration is needed: roles are config, not stored rows.

## 5. Rich text

### 5.1 Add HTML → JSON

`fields/rich-text/` gains a parse function alongside `renderRichText`:

```ts
export function parseRichText(html: string, allow?: RichTextAllow): JSONContent;
```

Implemented with `linkedom` for a Worker-safe DOM, feeding tiptap's
`generateJSON` with `buildRichTextExtensions(allow)`. The same extension factory
governs both directions, so anything outside the field's `allow` list is dropped
by the schema rather than by hand-written clamping.

Measured cost: linkedom bundles and minifies to 269 KB raw, 97 KB gzipped, against
Cloudflare's 3 MB gzipped free-tier ceiling.

Export it from the root `astromech` surface next to `renderRichText`.

### 5.2 Delete the segment and markdown converters

`fields/rich-text/segments.ts` and `fields/rich-text/markdown.ts` are deleted with
their tests. `content/` was their only caller.

HTML replaces both. The segment approach made structural change impossible by
construction, which was right for translate and wrong for transform and generate,
and it isolated each block from the surrounding document, which causes the classic
translation failures (pronoun antecedents, terminology drift). Markdown carried
too little: link `target`/`rel`/`class` had to be restored by href because the
format cannot express them.

### 5.3 What §5.1 unlocks beyond AI

HTML paste into the editor, editing rich text as HTML, and sending HTML to a
non-model translation service. `admin/components/fields/richtext-field.tsx`
currently wraps legacy HTML strings in a plain paragraph rather than parsing them,
with a comment explaining that a full parse needs a DOM. That can be fixed once
`parseRichText` exists, though it is not part of this work.

## 6. What is deliberately not built

`translate`, `transform` and `generate` are not reimplemented here. There is no
UI design for them yet: whether the entry point is a per-field button, a rich-text
toolbar item, a document-level action, or something else determines the shape of
the operation, and building before that is what produced the module being removed.

When they return, two things from the current design should carry over and are
recorded in `decisions/`: the operation owns the read, the field selection, the
placement and the write, so entry data never round-trips through a model's context
as something it must reconstruct; and the result lands staged or unpublished for
human review, never published.

The permission question stays open with a lean: these are probably not their own
namespace, and fold into the target type's `update`. That would retire the double
permission gate, which exists only because `content:translate` and
`entry:post:update` are disjoint namespaces that each had to be checked.

## 7. Sequencing

One branch, one worktree, a commit per step. Nothing is deleted before its
replacement path exists.

1. **`ai/` capability** — registry, config type, boot wiring, logging middleware,
   `getModel`/`hasModel`, tests.
2. **`parseRichText`** — linkedom, export, round-trip tests over a document
   exercising links with attributes, nested lists, and marks that exclude others.
3. **Assistant rename** — package, identifiers, table names, regenerated baseline
   migration, demo config.
4. **Assistant consumes `getModel`** — options shrink, absence handled, §3.4
   resolved or explicitly deferred with a written reason.
5. **Remove `content/`** — the table in §4, plus `ARCHITECTURE.md` and the
   roadmap edit.
6. **Docs** — `decisions/` records (§9), `TERMINOLOGY.md` entry for the capability,
   `apps/docs/` page on configuring `ai`.

Steps 1 and 2 are independent and can be written in parallel. 3 and 4 are
sequential. 5 depends on nothing but is last so the branch never sits in a state
where the assistant is half-moved and the old path is gone.

## 8. Step two, after this ships

**Evaluate `ToolLoopAgent` as a replacement for the hand-written loop.** AI SDK v7
ships one, with built-in tool approvals including policy-based approvals, which
overlaps directly with `decisions/0020`.

The question is not whether it works but whether it has the property
`decisions/0020` was built for: the approval is a server-held row, claimed and
answered in a single conditional update, and the tool call executes with the
**row's** arguments rather than the transcript's, so a model cannot forge its own
approval. An in-transcript or client-driven approval does not have that property.
Read the implementation before assuming either answer.

Also confirm before migrating: tool search with deferred loading (documented as
`toolSearchBm25_20251119()` / `toolSearchRegex_20251119()` with
`deferLoading: true`), and thinking-block round-tripping. [vercel/ai#11602](https://github.com/vercel/ai/issues/11602)
reports reasoning signatures being lost across multi-step tool calls; it is open,
but filed against `ai@6.0.x` and `@ai-sdk/anthropic@3.0.x`, two majors behind.
Unverified on v7.

## 9. Decision records to write

- **AI as an optional core capability.** Why core, not the plugin: one credential,
  one config block, one logging path, and a second consumer costs a few lines
  instead of a second SDK dependency. Why optional: absent unless configured, in
  the `email` mould. Rejected: keeping it in the plugin (unreachable by other
  plugins), making it required (core does not need a model to run).
- **Core hands out a model, it does not wrap generation.** Why the surface is two
  functions. Rejected: a `rewrite`-style facade, which is the mistake
  `ContentProvider` made; wrapping AI SDK in a second provider-agnostic layer.
  Includes the middleware answer to the chokepoint objection, and the decision
  that spend limits belong in the provider dashboard.
- **AI SDK over the vendor SDK and over agent frameworks.** Rejected: LangChain JS
  and Mastra (agent frameworks, wrong altitude for a capability), LlamaIndex.TS
  (RAG-first), staying on `@anthropic-ai/sdk` (not provider-agnostic). Note the
  cost accepted: three majors in about a year, mitigated by keeping AI SDK types
  out of the plugin-facing surface beyond `LanguageModel`.
- **Removing the content operations.** What they were, why they are going (a port
  with no adapter, exposed as broken tools the model could discover and call), and
  the two properties to carry forward when they return (§6).
- **HTML as the rich-text model interchange format.** Why not segments, why not
  markdown, why not raw ProseMirror JSON. The trade accepted: structure
  preservation for translate stops being a construction guarantee and becomes
  instruction plus review.
- **`@astromech/assistant`.** What it was called, why it changed, what the name
  beat.

Add each to `decisions/README.md`.

## 10. Open questions

- **Logging destination.** The middleware logs through the plugin logger path
  today. Whether model calls should also land in the audit trail P10 is designing
  is a P10 question, not this one, but the two should not end up with two records
  of one call that can disagree.
- **`getModel` naming for consumers.** `getModel('assistant')` uses a bare string.
  Whether named models want a registered-name convention (so two plugins do not
  both claim `'default'` meaning different things) is worth deciding before a
  second consumer exists, not after.
