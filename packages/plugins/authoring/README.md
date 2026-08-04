# @astromech/authoring

An AI authoring assistant for the Astromech admin: a topbar button in the
admin shell's `toolbar` slot opening a chat panel in its `right-drawer` slot,
backed by a server-side model loop that calls the site's own service methods.

**Read-only for now.** The assistant is restricted to methods that do not
mutate, because approving a write needs a UI that does not exist yet. See
`readOnly` below.

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
    readOnly: true, // default; drop every mutating method from the surface
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
