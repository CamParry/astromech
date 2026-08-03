# @astromech/authoring

An AI authoring assistant for the Astromech admin. **Unfinished** — this is
the identity/options/permissions skeleton; there is no chat surface yet.

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
});
```

The API key is read server-side from the named env var per request — it is
never bundled or sent to the browser.

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
