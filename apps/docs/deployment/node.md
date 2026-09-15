# Deploying to Node

This page runs a site set up by [the installation guide](../installation.md),
which uses `@astrojs/node` in standalone mode, as a production server. For
Cloudflare Workers, see [cloudflare.md](cloudflare.md).

Run every command below from the project root. The paths in your config,
including the `migrations` folder or your `migrationsDir`, resolve against the
working directory, as
[the installation guide explains](../installation.md#run-every-command-from-the-project-root).

## Build

```sh
npx astro build
```

The build writes the server to `dist/server/entry.mjs` and the static files to
`dist/client`. The server imports your dependencies at runtime, so deploy it
with the project's `node_modules` installed.

When the build finishes, it applies any pending migrations to the database your
config names. Unlike the CLI, it does not refuse a remote database, so the
environment of the machine that builds decides which database is migrated. If
`DATABASE_URL` points at production there, the build migrates production.

## Set the environment

Set `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` when the server sees a different
host name from the browser, as the table in
[../installation.md](../installation.md#4-set-the-environment) describes. The
server also reads these:

| Variable              | What it is                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`                | The address to listen on. Defaults to Astro's `server.host`, which is `localhost`. Use `0.0.0.0` to accept connections from other machines or from outside a container. |
| `PORT`                | The port to listen on. Defaults to Astro's `server.port`, which is `4321`.                                                                                              |
| `DATABASE_URL`        | The database `libsql()` opens when the config passes no `url`. Defaults to `file:./database.db`.                                                                        |
| `DATABASE_AUTH_TOKEN` | The auth token `libsql()` sends when the config passes no `authToken`.                                                                                                  |

[../configuration/database.md](../configuration/database.md#libsql) covers the
database options.

Leave `NODE_ENV` unset or set it to `production`. Under `development` or `test`,
Astromech serves without `BETTER_AUTH_SECRET`, and under `development` its API
error responses include the exception message.

## Apply migrations before you start the server

```sh
npx astromech db:init
```

The server never applies migrations. When it starts, it compares the database
with the `migrations` folder, or your `migrationsDir`, and logs a warning naming
any that are pending. Run
`db:init` against the production database before starting a new build.

The CLI refuses a remote database, meaning any `libsql:`, `http:`, `https:`,
`ws:` or `wss:` URL, such as Turso's. Pass `--allow-remote` to migrate one:

```sh
npx astromech db:init --allow-remote
```

Both `db:init` and the build refuse a database that does not enforce foreign
keys, so check that your libSQL host has them on.

## Start the server

```sh
node dist/server/entry.mjs
```

Run it from the project root, so that `file:./database.db`, `./uploads` and the
`migrations` folder (or your `migrationsDir`) resolve to the right place. Any
process manager or container
works, as long as it runs this command with the environment above.

With no `scheduler` in your config, scheduled jobs run from `interval()`, a timer
inside this process that ticks once a minute. To drive them from outside
instead, such as from a system crontab, use `webhook()` and set
`ASTROMECH_CRON_SECRET`, as
[../configuration/scheduler.md](../configuration/scheduler.md) describes.

Behind a reverse proxy, set `BETTER_AUTH_URL` to the public origin, and set
`security.trustProxy` so Astromech reads the client address from
`x-forwarded-for`, as
[../configuration/trust-proxy.md](../configuration/trust-proxy.md) describes.

## Uploads

With `filesystem({ dir: './uploads' })` and no `urlPrefix`, as the installation
guide sets up, the server writes uploaded files to `./uploads` and serves them
through Astromech's media route. Do not point `dir` into `public/` with
`urlPrefix` set: the built server serves `dist/client`, not `public/`, so a file
uploaded after the build returns 404.
[../configuration/storage.md](../configuration/storage.md#filesystem) explains
why.

## What to keep between deploys

A new build replaces `dist`. Keep these outside it, and keep them when you
replace the code:

- the SQLite file, when your database URL is a `file:` URL
- the uploads directory, `./uploads` or whatever `dir` your `filesystem()`
  config names

The `migrations` folder, or your `migrationsDir`, is committed to git, so each
checkout brings it.
