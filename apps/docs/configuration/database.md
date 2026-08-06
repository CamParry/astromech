# Database

One database driver per install, set as `db` in your config. It supplies the
Kysely instance every query in the CMS runs through, and the dialect
better-auth builds its own instance from.

```ts
import { defineConfig } from 'astromech';
import { libsqlDriver } from 'astromech/database/libsql';

export default defineConfig({
    db: libsqlDriver({ url: 'file:./database.db' }),
    // …
});
```

## Choosing a driver

| Driver           | Import                      | For                                              | Runs on                    |
| ---------------- | --------------------------- | ------------------------------------------------ | -------------------------- |
| `libsqlDriver()` | `astromech/database/libsql` | local development, single-server Node, and Turso | Node                       |
| `d1()`           | `astromech/database/d1`     | Cloudflare Workers with a D1 database binding    | Workers; Node via wrangler |

Each driver has its own subpath so that importing one never pulls the other's
client library into your bundle — that is what keeps `@libsql/client` out of a
Workers build.

v1 is SQLite-only. Postgres and MySQL are a future major, not a flag.

## `libsqlDriver()`

```ts
import { libsqlDriver } from 'astromech/database/libsql';

libsqlDriver({ url: 'file:./database.db' });
libsqlDriver(); // reads DATABASE_URL, falls back to file:./database.db
```

| Option      | Required | What it is                                            |
| ----------- | -------- | ----------------------------------------------------- |
| `url`       | no       | libsql URL — `file:…` locally, `libsql://…` for Turso |
| `authToken` | no       | Turso auth token; falls back to `DATABASE_AUTH_TOKEN` |

Both options fall back to environment variables (`DATABASE_URL`,
`DATABASE_AUTH_TOKEN`), so the same config works across environments without
branching.

`dump()` and `restore()` — the operations `@astromech/backups` is built on —
are supported for **local file databases only**. They use `VACUUM INTO`, which
needs a local file, so a remote Turso URL is rejected with an explicit error
rather than silently producing a broken backup.

## `d1()`

```ts
import { d1 } from 'astromech/database/d1';

db: d1({ binding: 'DB' });
```

| Option     | Required | What it is                                           |
| ---------- | -------- | ---------------------------------------------------- |
| `binding`  | one of   | the **name** of a D1 binding in your wrangler config |
| `database` | one of   | an already-resolved `D1Database` object              |

Exactly one of `binding` or `database` — the types enforce it.

### Why a binding _name_ and not the database

The same reason as `r2()`: `import { env } from 'cloudflare:workers'` does not
resolve in plain Node, and the CLI (`db:generate`, `db:init`, scripts, tests)
loads your full config in a plain Node process. A config that imported
`cloudflare:workers` directly would break every CLI command.

So you pass a string. On Workers it resolves through `cloudflare:workers`; in
Node it resolves through wrangler's `getPlatformProxy()`, which emulates the
platform against your wrangler config. Resolution is deferred until the first
query, so building the driver never fails at config-load time.

### D1 has no transactions

This is the constraint to design around, and it is permanent rather than a gap
waiting to be filled. D1's only atomicity primitive is `batch()`, which
executes a list of statements prepared up front — it cannot interleave
application logic, so it cannot implement an interactive transaction.

`d1()` therefore declares `supportsTransactions: false`, and entry storage
**omits its optional `transaction` method** entirely. The operations that would
otherwise use one — entry create (row + relationship rows), bulk operations,
and staged-entry merge — already check for it and fall back to sequential
writes.

The practical consequence: on D1, a failure partway through one of those
operations can leave the earlier writes committed. On libsql the same operation
rolls back. That is a real difference in durability guarantees, and it is why
the capability is declared rather than faked — a no-op transaction would give
the identical behaviour while reading like it was safe.

Nothing calls `db.transaction()` directly; if something does, the D1 dialect
throws with an explicit message rather than silently dropping atomicity.

### Backups are not available on D1

`d1()` implements neither `dump()` nor `restore()`. `D1Database.dump()` only
ever worked on databases created during D1's alpha period, and D1's export and
point-in-time-recovery paths (`wrangler d1 export`, the REST export API, Time
Travel) are control-plane operations rather than something a driver can perform
in-process.

`@astromech/backups` feature-detects this: its admin page reports
`canDump: false` / `canRestore: false`, and a triggered backup records a failed
run with `dump not supported by this database driver` instead of throwing. Use
[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) —
which is always on, needs no setup, and covers the last 30 days — as the backup
story on D1.

### Migrations on D1

Migrations apply normally. Kysely's `Migrator` only wraps a migration in a
transaction when the dialect reports transactional DDL support, and the SQLite
adapter reports `false` — so the migration runner never asks D1 for a
transaction it cannot give.

D1 runs every statement behind a SQLite authorizer, which rejects some
introspection SQL that plain SQLite accepts — including the query Kysely's own
`SqliteIntrospector` uses to read column metadata. `d1()` supplies its own
introspector that stays inside what the authorizer allows, so `db.introspection`
and anything built on it (the migration runner included) work the same on both
drivers.

Generation is unchanged too: `db:generate` diffs your tables and
writes the migration files, and none of that touches the database.

## What a driver provides

```ts
type DatabaseDriver = {
    type: string;
    getInstance(): Kysely<DB>;
    createDialect(): Dialect;
    supportsTransactions?: boolean;
    dump?(): Promise<DbDump>;
    restore?(source, opts): Promise<void>;
};
```

`getInstance()` returns the shared Kysely instance — the one with
`CamelCasePlugin` applied, which everything in the CMS queries through. It is
**synchronous**, which matters for the binding-based drivers: `d1()` resolves
its binding inside Kysely's `acquireConnection()`, which is already async, so
nothing needs to widen this signature.

`createDialect()` returns a fresh, plugin-free dialect on every call.
better-auth builds its own Kysely instance and must not inherit
`CamelCasePlugin` — it has its own snake_case field maps and would be
double-transformed. This is the seam that lets any driver back auth, rather
than auth being wired to one client type.

`supportsTransactions` is how a driver says it cannot do interactive
transactions. Absent or `true` means it can.

`dump` and `restore` are optional and feature-detected by consumers. Omit them
rather than throwing — the backups plugin reads their presence as a capability
and degrades cleanly when they are absent.
