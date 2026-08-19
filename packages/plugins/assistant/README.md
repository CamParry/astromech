# @astromech/assistant

An AI assistant for the Astromech admin: a topbar button in the
admin shell's `toolbar` slot opening a chat panel in its `right-drawer` slot,
backed by a server-side model loop that calls the site's own service methods.

**Nothing that changes stored data runs unasked.** A mutating call is held for
the user's approval and put to them in the drawer (see
[Approvals](#approvals)). Set `readOnly: true` to keep those methods off the
tool surface entirely instead.

## Install

The model comes from core's `ai` capability, not from this plugin. Register one
under the name `assistant`:

```ts
// astromech.config.ts
import { anthropic } from '@ai-sdk/anthropic';
import { assistant } from '@astromech/assistant';
import { defineConfig } from 'astromech';

export default defineConfig({
    ai: { models: { assistant: anthropic('claude-opus-5') } },
    plugins: [assistant()],
});
```

`anthropic()` reads `ANTHROPIC_API_KEY` from the environment server-side; no key
is bundled or sent to the browser. Without a model the plugin still installs and
the drawer still opens, but a chat request answers 503 — see
[Configuring `ai`](../../../apps/docs/configuration/ai.md).

**The model must be an Anthropic one.** The tool search below is an Anthropic
provider tool with no equivalent elsewhere, and the plugin refuses a model from
another provider rather than loading its whole catalogue.

## Options

```ts
assistant({
    effort: 'medium', // default; 'low' | 'medium' | 'high'
    readOnly: false, // default; `true` drops every mutating method from the surface
});
```

## The tool surface

The assistant's reach is the method manifest, resolved through the signed-in
user's role: a refused call means that user lacks the permission, and there is
no method it can name that they could not call themselves.

A site publishes one method set per entry type, so the catalogue runs to
hundreds of tools — well past the 30–50 where a model's tool selection starts
to degrade. Every tool is therefore deferred and found through the server-side
tool-search tool, which is the one tool loaded up front. Nothing is curated as
always-resident: the tools an author reaches for are named after their own entry
types, so there is no fixed set to pick.

## Approvals

A method that changes stored data is declared to the model with no way to run
it, so the loop halts the moment the model calls one. Read-only calls in the
same step still run; nothing mutating does.

Each held call gets a row in `plugin_assistant_approvals` — the acting user, the
call id, the method, the arguments and whether it is destructive — and the
browser gets an `approval-required` event carrying a question per call.

The drawer puts each question to the user between the transcript and the
composer, and posts the transcript back once every held call has an answer —
one request carries them all, because a call left out of it is one the server
declines. Typing a new message instead answers none of them, which declines
them all.

The user's answers come back on the next request as
`decisions: [{ approvalId, action }]`. Claiming a row and answering it are one
conditional UPDATE, which matches only while the row belongs to that user, is
still pending, and is inside its one-hour life — so two requests carrying the
same decision run the call once. An approved call then runs **with the
arguments from its row**, never with the ones in the posted conversation: a
client that edits the transcript changes what the model sees, not what runs. A
rejected call, a row that expired, a row belonging to someone else, and a tool
the user's role no longer holds all answer the same way — a `tool_result`
saying it was not run, which the model reads as an answer rather than a
failure. So does a call the user walked away from without answering.

A resolved row keeps its method, target, decision, who approved it and when.
It does not keep the arguments: those are dropped in the same write that
answers it, because an update carries field values that may be `private: true`,
and the rest of the row is the part worth auditing.

This is a different mechanism from core's `evaluateConfirmation`, which is a
stateless brake at dispatch level. That one takes the caller's word that a
human said yes; this one holds the answer server-side and reads it back.

## Permissions

The plugin declares one permission, which the factory's `permissions()`
accessor returns already namespaced:

- `use` — open the assistant, i.e. `plugin:assistant:use`

Nothing is granted automatically: `admin` holds `*` and so has it already,
every other role opts in by naming the key.

```ts
// astromech.config.ts
import { assistant } from '@astromech/assistant';
import { defineConfig, permissionsForBuiltInRole } from 'astromech';

export default defineConfig({
    plugins: [assistant()],
    roles: {
        'content-editor': {
            name: 'Content Editor',
            permissions: [
                ...permissionsForBuiltInRole('editor'),
                ...assistant.permissions('use'),
            ],
        },
    },
});
```
