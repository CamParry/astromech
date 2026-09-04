# astromech

A lightweight TypeScript CMS: a framework-agnostic core plus an Astro
integration, built on Hono and TanStack Router. It runs on Node and on
Cloudflare Workers, against SQLite-family databases (libsql and D1). Sites read
content in templates through the in-process application or the typed fetch
client.

## Install

```sh
pnpm add astromech astro
```

The admin is a React app served from your site, and a site owns the copies of
the packages the runtime shares with it. Install these alongside:

```sh
pnpm add react react-dom better-auth kysely
```

Some drivers need a package of their own, as an optional peer dependency you
install only with the subpath that loads it:

| Subpath                       | Install                                |
| ----------------------------- | -------------------------------------- |
| `astromech/database/libsql`   | `@libsql/client @libsql/kysely-libsql` |
| `astromech/storage/s3`        | `aws4fetch`                            |
| `astromech/media/image/sharp` | `sharp`                                |
| `astromech/email/smtp`        | `nodemailer`                           |

## Setup

Add the integration to `astro.config.mjs`:

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

Then `astromech.config.ts`:

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

Every driver is its own export subpath, so a site installs and bundles only what
it uses: `astromech/database/libsql` and `astromech/storage/filesystem` on Node,
`astromech/database/d1` and `astromech/storage/r2` on Cloudflare Workers. See
[apps/docs/configuration/database.md](https://github.com/CamParry/astromech/blob/main/apps/docs/configuration/database.md)
and
[apps/docs/configuration/storage.md](https://github.com/CamParry/astromech/blob/main/apps/docs/configuration/storage.md).

Generate and apply the migrations for your tables with the bundled CLI, then
open `/cms`, which shows a setup screen while no users exist:

```sh
npx astromech db:generate
npx astromech db:init
```

## Reading content from your site

`getAstromech()` returns the running application, so a template queries the
services directly with no HTTP round trip:

```ts
import { getAstromech } from 'astromech';

const app = await getAstromech();
const result = await app.entries.query({
    type: 'post',
    where: { slug: 'hello-world' },
    limit: 1,
});
const post = result.data[0] ?? null;
```

## Subpaths

| Subpath                            | What it exports                                              |
| ---------------------------------- | ------------------------------------------------------------ |
| `astromech`                        | `defineConfig`, `getAstromech`, the define helpers, types    |
| `astromech/fields`                 | Field factories for entry types, globals, media and users    |
| `astromech/columns`                | Admin list-view column factories                             |
| `astromech/astro`                  | The Astro integration                                        |
| `astromech/database/libsql`        | libsql database driver: a local SQLite file, or Turso        |
| `astromech/database/d1`            | Cloudflare D1 database driver                                |
| `astromech/storage/filesystem`     | Local-disk media storage                                     |
| `astromech/storage/r2`             | Cloudflare R2 media storage                                  |
| `astromech/storage/s3`             | S3-compatible media storage                                  |
| `astromech/media/image/sharp`      | Image transforms through sharp                               |
| `astromech/media/image/cloudflare` | Image transforms through Cloudflare                          |
| `astromech/email/console`          | Email driver that prints each message                        |
| `astromech/email/resend`           | Email driver for Resend                                      |
| `astromech/email/smtp`             | Email driver for SMTP, through nodemailer                    |
| `astromech/scheduler/interval`     | Scheduler driver: an in-process timer in the serving process |
| `astromech/scheduler/cloudflare`   | Scheduler driver for Cloudflare Cron Triggers                |
| `astromech/scheduler/webhook`      | Scheduler driver ticked by an external request               |
| `astromech/cloudflare`             | `createWorkerEntry`, binding lookup, runtime detection       |
| `astromech/ui`                     | Admin component kit: props-only components                   |
| `astromech/ui/fields`              | Field renderers a custom field type composes                 |
| `astromech/ui/layout`              | Page shell, breadcrumbs, toolbars and form layout            |
| `astromech/ui/app`                 | Admin components that need the running admin                 |

## Documentation

- [apps/docs/README.md](https://github.com/CamParry/astromech/blob/main/apps/docs/README.md): guides and reference.
- [ARCHITECTURE.md](https://github.com/CamParry/astromech/blob/main/ARCHITECTURE.md): where code lives and what it
  may import.
- [TERMINOLOGY.md](https://github.com/CamParry/astromech/blob/main/TERMINOLOGY.md): what a term means today.
- [DECISIONS.md](https://github.com/CamParry/astromech/blob/main/DECISIONS.md): why a choice beat its alternatives.

## License

MIT
