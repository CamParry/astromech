# CLI

The `astromech` CLI is a **trusted transport** — it talks to the services
directly and does **not** enforce permissions (like seeding, it runs with full
access). Use it for local administration, scripting, and as the reference
consumer of the [method manifest](#method-discovery).

```sh
astromech <command> [args] [--config path/to/astromech.config.ts]
```

`--config` points at your `astromech.config.ts` (defaults to one in the current
directory). Every command accepts it.

## JSON output

Commands that emit data take `--json`, which prints machine-readable JSON to
stdout. Without it you get a human-readable line. Errors print to **stderr**
(`{"error": "..."}` in `--json` mode) and set a non-zero exit code.

```sh
astromech entries:create post --title "Hello" --json
astromech methods --json
```

## Entries

| Command                         | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `entries:list <type>`           | List entries (`--status`, `--limit`, `--json`)    |
| `entries:get <type> <id>`       | Fetch one entry (JSON)                            |
| `entries:create <type>`         | Create an entry                                   |
| `entries:update <type> <id>`    | Update an entry                                   |
| `entries:publish <type> <id>`   | Publish an entry                                  |
| `entries:unpublish <type> <id>` | Revert an entry to draft                          |
| `entries:delete <type> <id>`    | Permanently delete (`--force` to skip the prompt) |

`create`/`update` take scalar flags (`--title`, `--slug`, `--locale`,
`--status`, `--publishAt`) plus `--fields` for field data. `--fields` (and
`update`'s `--data`, the full update payload) accept inline JSON or `@file` to
read from disk. Explicit flags override values in `--data`.

```sh
astromech entries:create post \
  --title "Launch post" --status draft \
  --fields '{"body":"…","featured":true}'

astromech entries:update post <id> --data @patch.json
astromech entries:publish post <id> --json
```

## Method discovery

`methods` reflects the [method manifest](#cli) — every callable across core,
entries, and plugins, with effect hints and permission strings. It regenerates
from your config in-memory, so it needs no prior build.

```sh
astromech methods                     # text: name, [effects], (permission)
astromech methods --source entries    # filter by source: core | entries | plugin
astromech methods --filter create     # case-insensitive substring on method name
astromech methods --json              # full manifest entries (input/output schemas, entryType, …)
```

## Users & database

| Command                                                      | Description                                  |
| ------------------------------------------------------------ | -------------------------------------------- |
| `users:create` / `users:list` / `users:get` / `users:delete` | Manage users                                 |
| `db:init` / `db:status` / `db:generate`                      | Initialise, inspect, and generate migrations |
| `generate:types`                                             | Emit `.d.ts` type definitions                |
| `generate:manifest`                                          | Write `.astro/astromech.methods.json`        |
