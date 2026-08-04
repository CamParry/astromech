# @astromech/authoring

An AI authoring assistant for the Astromech admin: a topbar button in the
admin shell's `toolbar` slot opening a chat panel in its `right-drawer` slot,
backed by a server-side model loop that calls the site's own service methods.

**Nothing that changes stored data runs unasked.** A mutating call is held for
the user's approval and put to them in the drawer (see
[Approvals](#approvals)). Set `readOnly: true` to keep those methods off the
tool surface entirely instead.

## Install

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import { authoring } from '@astromech/authoring';

export default defineConfig({
    plugins: [authoring()],
});
```

## Options

```ts
authoring({
    model: 'claude-opus-5', // default
    apiKeyEnv: 'ANTHROPIC_API_KEY', // default; env var holding the API key
    effort: 'medium', // default; 'low' | 'medium' | 'high'
    readOnly: false, // default; `true` drops every mutating method from the surface
});
```

The API key is read server-side from the named env var per request — it is
never bundled or sent to the browser.

`model` is a fixed set rather than a free string. AI context reaches the model
as a `role: 'system'` message inside `messages`, which models that do not
support it silently downgrade to a top-level `system` block — a quiet wrong
answer in place of a hard failure.

## The tool surface

The assistant's reach is the method manifest, resolved through the signed-in
user's role: a refused call means that user lacks the permission, and there is
no method it can name that they could not call themselves.

A site publishes one method set per entry type, so the catalogue runs to
hundreds of tools — well past the 30–50 where a model's tool selection starts
to degrade. Every tool is therefore sent with `defer_loading: true` and found
through the server-side tool-search tool, which is the one tool loaded up
front. Nothing is curated as always-resident: the tools an author reaches for
are named after their own entry types, so there is no fixed set to pick.

## Approvals

When a turn reaches a method that changes stored data, the loop stops before
anything runs. It records one row per call in `plugin_authoring_approvals` —
the acting user, the call's `tool_use` id, the method, the arguments and
whether it is destructive — and sends the browser an `approval-required` event
carrying a question per call. Nothing has executed at that point.

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

- `use` — open the assistant, i.e. `plugin:authoring:use`

Nothing is granted automatically: `admin` holds `*` and so has it already,
every other role opts in by naming the key.

```ts
// astromech.config.ts
import { builtInRole, defineConfig } from 'astromech';
import { authoring } from '@astromech/authoring';

export default defineConfig({
    plugins: [authoring()],
    roles: {
        'content-editor': {
            name: 'Content Editor',
            permissions: [...builtInRole('editor'), ...authoring.permissions('use')],
        },
    },
});
```
