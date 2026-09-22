# Installation

This page takes an Astro site to a working admin you are signed in to. It sets
up a Node server with a local SQLite file. For Cloudflare Workers, follow the
same steps and make the changes in
[deployment/cloudflare.md](deployment/cloudflare.md) as you go.

You need Node 22.13 or later and an Astro project. Astromech supports Astro 7,
which step 1 installs.

## Run every command from the project root

Astromech resolves relative paths against the working directory. That covers
the config file the CLI loads and every path inside the config, such as
`file:./database.db`, `./uploads` and the migrations folder. Run a command from
anywhere else and the CLI cannot find your config, and the server opens a
database file in the wrong place.
[configuration/database.md](configuration/database.md#where-filedatabasedb-points)
shows what this means for the database path.

## 1. Install the packages

```sh
npm install astromech astro react react-dom better-auth kysely @astrojs/react @astrojs/node @libsql/client @libsql/kysely-libsql
```

- `react`, `react-dom`, `better-auth` and `kysely` are peer dependencies. Your
  site and Astromech share one copy of each.
- `@astrojs/react` renders the admin, which is a React app.
- `@astrojs/node` is the adapter that serves the site on Node. On another host,
  install that host's adapter instead.
- `@libsql/client` and `@libsql/kysely-libsql` back the `libsql()` database
  driver used below. Other drivers need other packages: see
  [Optional packages](#optional-packages).

## 2. Add the integration to Astro

```js
// astro.config.mjs
import node from '@astrojs/node';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { astromech } from 'astromech/astro';

export default defineConfig({
    output: 'server',
    adapter: node({ mode: 'standalone' }),
    integrations: [astromech(), react()],
});
```

Keep `astromech()` before `react()`, because the step that splits the admin
into one file per page has to run before React's transform, and Astro runs
integrations in the order you list them.

`astromech()` loads `astromech.config.ts` from your Astro project root. To keep
the config somewhere else, pass its path, relative to the project root:

```js
astromech({ configFile: './cms/astromech.config.ts' });
```

The CLI does not read `astro.config.mjs`, so give it the same path with
`--config` on every command:

```sh
npx astromech db:init --config ./cms/astromech.config.ts
```

[DECISIONS.md](../../DECISIONS.md) records why the integration takes a path
rather than the config itself.

## 3. Write the config

Create `astromech.config.ts` in the project root:

```ts
// astromech.config.ts
import { defineConfig } from 'astromech';
import { libsql } from 'astromech/database/libsql';
import * as fields from 'astromech/fields';
import { filesystem } from 'astromech/storage/filesystem';

export default defineConfig({
    db: libsql({ url: 'file:./database.db' }),
    storage: filesystem({ dir: './uploads' }),
    entries: {
        post: {
            single: 'Post',
            plural: 'Posts',
            fields: [fields.richtext('body', { label: 'Body' })],
        },
    },
});
```

`db`, `storage` and `entries` are the three keys every config needs. To choose
them:

- [configuration/database.md](configuration/database.md) for the database
  drivers.
- [configuration/storage.md](configuration/storage.md) for where media files
  go.
- [content/entry-types.md](content/entry-types.md) for declaring your content.

With this config, files uploaded in the admin are written to `./uploads` and
served through Astromech's media route. Add `uploads/` to your `.gitignore`.

## 4. Set the environment

Development needs no environment variables. Before you deploy, set these:

| Variable             | Required | What it is                                                                      |
| -------------------- | -------- | ------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | yes      | The key that signs sessions. Use at least 32 random characters.                 |
| `BETTER_AUTH_URL`    | no       | The site's public origin, such as `https://example.com`. Set it behind a proxy. |

Without `BETTER_AUTH_SECRET`, a built site refuses every request with a 500 and
logs `Astromech requires missing env var: BETTER_AUTH_SECRET`. Generate one with
`openssl rand -base64 32`. `astro dev` runs without it.

Without `BETTER_AUTH_URL`, Better Auth takes the origin from each request and logs
a `Base URL is not set` warning. It refuses a sign-in or sign-up that comes from
any other origin, so set the variable when the server sees a different host name
from the one in the browser.

Set both in the server's environment. If you keep them in a `.env` file, one way
to load it is to run `npm install dotenv`, then add `import 'dotenv/config'` at
the top of `astromech.config.ts`. On Cloudflare Workers, set the secret with
`wrangler secret put`, as
[deployment/cloudflare.md](deployment/cloudflare.md#environment-variables)
describes.

## 5. Create the tables

```sh
npx astromech db:generate
npx astromech db:init
```

`db:generate` writes the migrations for Astromech's tables into `./migrations`.
Commit that folder. `db:init` applies the migrations to the database in your
config. `astro dev` and `astro build` also apply any that are pending, but only
once `db:generate` has created the folder. To keep the folder somewhere else,
set `migrationsDir` in your config, as
[data/migrations.md](data/migrations.md#the-migrations-folder) describes.

[data/migrations.md](data/migrations.md) covers what the generator writes and
when to run it again. [cli.md](cli.md) lists every command.

## 6. Start the dev server and finish setup

```sh
npx astro dev
```

Open `http://localhost:4321/cms`. The admin is served at `/cms` and its API at
`/cms/api`. To move both, set `basePath` in your config.

While the database has no users, the admin shows a setup screen. Enter your
name, email and a password. Setup creates that first account with the `admin`
role, and it is the only way to create one without signing in: a sign-up is
refused with the code `SIGN_UP_CLOSED`. An admin adds everyone else from the
admin's Users screen, or with `astromech users:create`.

Finish setup before the site is public. Until the first account exists, anyone
who can reach `/cms` can create it.

## Deploying

[deployment/node.md](deployment/node.md) covers building the site and running
it as a production Node server.

## Optional packages

These are optional peer dependencies of `astromech`, so npm does not install
them. Install one when you use the driver or command that needs it.

| Package                                      | Needed for                                                              | Without it                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@libsql/client` and `@libsql/kysely-libsql` | `libsql()`, from `astromech/database/libsql`                            | The config fails to load, so `astro` and every CLI command stop at startup.                              |
| `aws4fetch`                                  | `s3()`, from `astromech/storage/s3`                                     | The config fails to load, so `astro` and every CLI command stop at startup.                              |
| `sharp`                                      | `sharp()`, from `astromech/media/image/sharp`                           | The config fails to load, so `astro` and every CLI command stop at startup.                              |
| `nodemailer`                                 | `smtp()`, from `astromech/email/smtp`                                   | The site runs. The first email fails with `smtp() requires nodemailer: npm install nodemailer`.          |
| `wrangler`                                   | `d1()` and `r2()` outside a Worker: the CLI, `astro dev`, `astro build` | The first database query or file access fails, saying it needs wrangler. Install it as a dev dependency. |
| `@modelcontextprotocol/sdk`                  | the `astromech mcp` command                                             | The command prints `Install @modelcontextprotocol/sdk to use the MCP server.` and exits with code 1.     |

[DECISIONS.md](../../DECISIONS.md) records which dependencies are optional peers
and why.
