# Astromech

A lightweight TypeScript CMS: a framework-agnostic core plus an Astro
integration, built on Hono and TanStack Router. It runs on Node and on
Cloudflare Workers, against SQLite-family databases (libsql and D1). Sites read
content in templates through the in-process application or the typed fetch
client.

## Packages

| Package                    | Directory                    | Description                                                                                                       |
| -------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `astromech`                | `packages/astromech`         | A lightweight, fast headless CMS                                                                                  |
| `@astromech/schema-engine` | `packages/schema-engine`     | Schema-as-state migration engine for SQLite: snapshot in, DDL, diffs, and forward-only Kysely migration files out |
| `@astromech/assistant`     | `packages/plugins/assistant` | An AI assistant for the Astromech admin                                                                           |
| `@astromech/backups`       | `packages/plugins/backups`   | Scheduled and on-demand database backups for Astromech                                                            |
| `@astromech/forms`         | `packages/plugins/forms`     | Forms with runtime-composed fields, a public submission API, and spam protection for Astromech                    |
| `@astromech/menus`         | `packages/plugins/menus`     | Developer-declared navigation menus for Astromech                                                                 |
| `@astromech/redirects`     | `packages/plugins/redirects` | URL redirects as a first-class entry type for Astromech                                                           |
| `@astromech/seo`           | `packages/plugins/seo`       | Search metadata, sitemap and SEO health dashboard for Astromech                                                   |

## Getting started

Install the core package and Astro:

```sh
pnpm add astromech astro
```

Add the integration to `astro.config.mjs`. The admin is a React app, so
`@astrojs/react` is part of the install:

```js
import node from '@astrojs/node';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { astromech } from 'astromech/astro';

export default defineConfig({
    output: 'server',
    adapter: node({ mode: 'standalone' }),
    integrations: [react(), astromech()],
});
```

Write `astromech.config.ts` next to it with a database, a storage driver and one
entry type:

```ts
import { defineConfig } from 'astromech';
import { libsql } from 'astromech/database/libsql';
import * as fields from 'astromech/fields';
import { filesystem } from 'astromech/storage/filesystem';

export default defineConfig({
    db: libsql(),
    storage: filesystem({ dir: './public/uploads', urlPrefix: '/uploads' }),
    entries: {
        post: {
            single: 'Post',
            plural: 'Posts',
            fields: [fields.richtext('body', { required: true })],
        },
    },
});
```

Generate the migrations for those tables, apply them, and start the dev server:

```sh
npx astromech db:generate
npx astromech db:init
npx astro dev
```

Open `/cms`. With no users in the database, the admin shows a setup screen that
creates the first admin account.

The guides in [apps/docs/README.md](apps/docs/README.md) cover the rest:
entry types, globals, media, relationships, drivers and plugins.

## Repository layout

`packages/*` is published to npm, `apps/*` is deployed and never published.

- `apps/demo`: the Astro site to run and browser-verify against, on Node.
- `apps/demo-cloudflare`: the same core on Workers, using D1, R2, edge image
  transforms and Cron Triggers.
- `apps/docs`: the user-facing guides and reference.

Three files at the root answer the questions the code does not:

- [ARCHITECTURE.md](ARCHITECTURE.md): where code lives and what it may import.
- [TERMINOLOGY.md](TERMINOLOGY.md): what a term means today.
- [DECISIONS.md](DECISIONS.md): why a choice beat its alternatives.

## Developing

pnpm is the package manager, pinned by `packageManager` in the root
`package.json`.

```sh
pnpm install
pnpm run build              # every published package, once, before an app runs
pnpm run dev                # rebuild the core package on change
pnpm -F astromech-demo dev  # the demo site, in another terminal
```

Run `pnpm run verify:fast` while working (typechecks, tests and lint, no build),
and `pnpm run verify` before a change lands. [AGENTS.md](AGENTS.md) has the full
table of checks and what each one covers.

## License

MIT
