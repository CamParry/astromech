# Migrations

Astromech generates migrations from your tables. You never write
schema SQL by hand, and you never edit a migration once it exists.

```bash
npm run db:generate -- --name add-author-column   # write the next migration
npm run db:init                                    # apply the chain
```

None of this is driver-specific. Migrations apply without a transaction on
every driver — Kysely only wraps a migration in one when the dialect reports
transactional DDL support, and the SQLite adapter reports `false` — so the
chain applies the same way on D1 as on libsql. See
[configuration/database.md](../configuration/database.md).

## What lives in `migrations/`

| File             | Written by | What it is                                            |
| ---------------- | ---------- | ----------------------------------------------------- |
| `NNNN_<name>.ts` | generator  | one forward step, as Kysely `sql` statements          |
| `journal.json`   | generator  | the ordered chain, keyed by `idx`                     |
| `snapshot.json`  | generator  | the schema state the chain arrives at                 |
| `index.ts`       | generator  | the static `MigrationProvider` the app imports        |
| `ops/`           | you        | records of hand-authored ops (see below); not applied |

Every one of those except `ops/` is machine-written. Editing `snapshot.json` by
hand is the one thing that genuinely breaks the system: the drift gate compares
that file against your live tables, so a hand-edit doesn't fix a mismatch,
it hides one.

## How generation decides

`db:generate` diffs `snapshot.json` against your tables and picks a plan:

- **Fast path** — additive changes (a new table, a new nullable column, a new
  index) become `ALTER TABLE` / `CREATE`.
- **Rebuild** — anything SQLite can't alter in place becomes the standard
  create-new / copy / drop / rename dance, with `defer_foreign_keys` around it.

Migrations are forward-only. There is no `down()`: a reverse step is a guess at
intent, and a wrong guess runs against production data.

## Things the generator will refuse

Generation stops with an error, and writes nothing, when it can't derive a
correct plan. The common ones:

- **A new NOT NULL column with no SQL-literal default.** The rebuild's
  `INSERT … SELECT` has nothing to put in existing rows.
- **An index naming a column that doesn't exist.**
- **A table name over 63 bytes.** Index names are capped and hashed
  automatically; table names are not, because they're the identifier you and
  your queries actually say.

There is also **no rename op**, by design. A rename and a drop-plus-add look
identical in a snapshot diff, so a generator that guessed "rename" would
silently destroy data whenever it guessed wrong. Renaming a column is a drop and
an add, and you decide how the data gets there.

## Hand-authored migrations

A few genuine reshapes have no derivable plan — swapping a primary key, or
adding a required column whose values come from somewhere the differ can't see.
For those, you supply the **ops** and the generator still writes everything else:

```ts
// migrations/ops/0002-plugins-tracking-package.ts
import type { MigrationOpsAuthor } from '@astromech/schema-engine/generate';

const author: MigrationOpsAuthor = ({ next }) => [
    { kind: 'dropTable', name: '_astromech_plugins' },
    { kind: 'createTable', table: next.tables._astromech_plugins! },
];

export default author;
```

```bash
npm run db:generate -- --ops migrations/ops/0002-plugins-tracking-package.ts \
    --name plugins-tracking-package
```

The author receives `{ prev, next, dialect }`: `prev` is where the chain
currently is, `next` is where your tables say it should end up. Build ops
out of `next.tables` rather than writing table shapes literally — then the SQL
that lands is the same SQL the generator emits everywhere else.

**The generator owns the destination; you own the route.** `snapshot.json` is
still written from your tables, not from your ops, so:

- a following `db:generate` must report **no changes** — if it doesn't, your
  ops didn't describe the state you actually asked for;
- the chain ↔ table parity test still applies the real SQL to a real
  database and compares the result.

Those two checks are what verify a hand-authored route arrives. Nothing
validates your ops symbolically, so run them.

You'll get a warning if the differ could have generated the transition on its
own. Heed it: a migration nobody can regenerate is a migration nobody can
review. Keep the ops file in `ops/` afterwards as a record of _why_ — it is not
re-run, and running it again would just append a duplicate migration.

A migration that drops data must be able to say why the loss is acceptable. If
it can't, it's the wrong migration.

## Plugins

Plugins own their own migrations and ship them in the package; a site applies
them but never generates them. From the plugin's directory:

```bash
npx astromech plugin:generate --name add-hits-column
```

Plugin migrations merge into the app's chain at apply time under a
`plugin_<namespace>_` key, so two plugins can each own a `0000_init`. Because
they merge, the combined chain isn't globally sortable and is applied with
`allowUnorderedMigrations` — installing a plugin can introduce a migration that
sorts before ones already recorded.

To remove a plugin's tables entirely:

```bash
npx astromech plugin:purge @acme/seo
```
