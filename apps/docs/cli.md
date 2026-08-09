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
`update`'s `--data`, the update patch) accept inline JSON or `@file` to read
from disk. Explicit flags override values in `--data`.

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

## Permission discovery

`permissions` lists every grantable permission your resolved config produces —
the strings you put in a role. Three sources: `core` (the fixed set core
enforces), `entry` (derived per registered entry type — nothing declares
these), and `plugin` (each plugin's `definePermissions` declaration, already
namespaced). Like `methods`, it resolves your config in-memory and needs no
prior build.

```sh
astromech permissions                 # text: permission, label, (owner)
astromech permissions --source plugin # filter by source: core | entry | plugin
astromech permissions --filter media  # case-insensitive substring on the permission string
astromech permissions --json          # full catalogue entries (description, source, owner)
```

## Users & database

| Command                                                      | Description                                  |
| ------------------------------------------------------------ | -------------------------------------------- |
| `users:create` / `users:list` / `users:get` / `users:delete` | Manage users                                 |
| `db:init` / `db:status` / `db:generate`                      | Initialise, inspect, and generate migrations |
| `generate:types`                                             | Emit `.d.ts` type definitions                |
| `generate:manifest`                                          | Write `.astro/astromech.methods.json`        |
| `index:rebuild`                                              | Rebuild the relationships index              |

## Relationships index

The `relationships` table is a derived index over your field data, so it can be
regenerated at any time. Rebuild it after a config change that adds or moves a
relationship field — nothing repopulates it automatically, and there is
deliberately no repair at startup.

```sh
astromech index:rebuild                    # rebuild every source
astromech index:rebuild --type post        # limit to one entry type
astromech index:rebuild --check            # report drift, write nothing, exit 1 if any
```

`--check` is the form to run in CI. Without `--type`, a rebuild deletes rows for
any source it did not enumerate — correct for a full pass, but the reason to
scope a partial one.

## MCP server (dev-only)

`astromech mcp` projects the build-time method manifest as MCP tools over
stdio. It is a **trusted, dev-only transport** — it loads your config and calls
services directly, with no permission enforcement (same as the CLI).

```sh
astromech mcp [--config path/to/astromech.config.ts]
```

To point an MCP client at it, use `stdio` transport:

```json
{
    "command": "node",
    "args": [
        "node_modules/astromech/dist/cli/index.js",
        "mcp",
        "--config",
        "apps/demo/astromech.config.ts"
    ]
}
```

Or, after a package build, point directly at the built CLI:

```json
{
    "command": "node",
    "args": [
        "packages/astromech/dist/cli/index.js",
        "mcp",
        "--config",
        "apps/demo/astromech.config.ts"
    ]
}
```

**Requires** `@modelcontextprotocol/sdk` to be installed in the project. If it
is missing, the command prints an install hint and exits with code 1.

**v1 coverage:** core domain methods (users, settings, media query/get/delete)
and the standard entry CRUD+publish actions (query, get, create, update,
publish, unpublish, delete). Not yet projected: plugin service methods, media
upload/replace (binary data cannot cross JSON-RPC), the notifications methods
(they act on the signed-in user's own rows and this transport has no signed-in
user), and entries long-tail actions (duplicate, trash, restore, emptyTrash,
versions, restoreVersion, schedule).

`astromech methods` lists everything in the manifest, including the methods MCP
declines to project, so a method missing from the tool list is still visible
there with the reason it was skipped.
