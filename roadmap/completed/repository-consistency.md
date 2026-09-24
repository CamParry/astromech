# Repository consistency

Every repository is reached the same way, speaks the same method vocabulary and
is laid out the same way. Resource repositories stay independent
implementations rather than extending a shared base. Names follow TypeORM,
Prisma and Strapi (`findOne`, `findMany`, `count`, `findBy…`). Access follows
the entries registry that already exists.

## Why

Checked against the code on 2026-09-24.

- **Four ways to reach a repository.** 16 user and media service methods
  construct one per call with `createUserRepository(ctx.config)` or
  `createMediaRepository(ctx.config)`. Entries use a registry
  (`getEntryRepository(type)`). Globals use a wrapper,
  `globalRepository(config)` in `globals/internal/global.ts`. Five files call
  `createRepository(table)` outside any repository: `content/usage.ts`,
  `content/relationships.ts`, `users/internal/credential-account.ts`,
  `entries/internal/relationships.ts` and
  `transport/cli/validate-stored-content.ts`.
- **Five factory signatures**: `(db?)`, `(config?)`, `(opts?: { db,
defaultLocale })`, `(table, db?)` and `(db = getDb())`. The last one is
  `createEntryMaintenanceRepository`, which binds the handle once when built;
  every other repository resolves it per call.
- **Nullable reads are called `get`**: the content repository, users, media,
  globals, entries, versions and `staging.getByCanonical`. The code skill says
  `get` throws, and every ORM above says `find`.
- **Six names for a list read**:
    - `list(params, page, locale)` plus `count(params)` for users and media;
    - `list(params)` returning `{ data, total }` with `limit: 'all'` for entries;
    - `query.list` on the content repository;
    - `listByUser` (notifications), `findAll` (relationships) and `packages()`
      (plugin tracking).

    There are two paging shapes, `{ limit, offset }` and `{ page, limit }`. And
    `query` means both the paged service method and the content repository's
    raw SQL namespace.

- **Three shapes for one pattern.** Users and media hand-pick what they return
  from the content repository. Globals spreads it whole (`{ ...content,
idByKey }`), which exposes `query` and `staging` and is extension in
  practice.
- **`owners` is public** on users and media. Seven calls in six files write
  through the raw table and skip the repository, for example
  `users/methods/update.ts` and `media/methods/replace.ts`.
- **Three locale-fallback rules:**
    - `findUser`: the asked locale, then the default, then the account row;
    - `findMedia`: the asked locale, then the default;
    - `content.anyLocale`: the default, then the first alphabetically.

    `getEntryResource` reads the default locale, then calls `anyLocale`, which
    reads it again.

- **Call chains are deeper than they need to be.**
    - Users: `getUser` → `findUser` → `repository.get(id, locale)`, which only
      reorders arguments → `content.get(ref)`.
    - Globals: `idByKey` then `get`, two queries where one joined read does.
    - Entries: `findEntryOfType` takes `config` only to pick the default locale,
      which the repository already does.
- **Layout.**
    - `database/repository/` holds the generic base and also two domain
      repositories (`relationships.ts` and `resource-existence.ts`).
    - Plugin tracking is `plugins/runtime/plugin-tracking-repository.ts`.
    - Users map rows with an inline `decode`; the others use a module-level
      `toXRow`.
- **`insertFirstUser` hides its condition.** It inserts the `users` row only
  while the table is empty (one `INSERT … SELECT … WHERE NOT EXISTS`), so a
  second racing first-run setup writes nothing.

## Decisions

**Resource repositories do not extend a base.** Payload, Strapi and Keystone
keep one generic implementation keyed by name, with no per-entity code.
Directus subclasses `ItemsService`. Its `UsersService` and `FilesService`
override four write methods each, so a change to the base has to be checked
against eight overrides. Here there are three layers, with a firm line between
them:

- **`createRepository(table)` is a tool, not a base.** Every repository calls
  it, and nothing extends it.
- **`createContentRepository` holds only what the three-table schema fixes:**
    - the owner-to-content join;
    - decoding and the locale list;
    - staging rows and versions;
    - the content-row insert and patch.

    Every resource has the same schema, so a difference there is a bug. It
    holds no read policy.

- **Each resource repository writes its own reads**: list, count, search,
  sort and locale fallback. They do this even where the code looks alike, so
  one resource can change without moving the others.

Consistency comes from rules, a surface test and `report:drift`, not from
shared code.

**Where a dependency comes from depends on when it can change:**

1. **Per call** (user, role, access, requested locale): passed as an argument
   on `ctx`, never a global.
2. **Per site** (database driver, storage, email and every repository): read
   from a registry on each call. Repositories go here even where config
   cannot swap them yet, so all of them are reached one way and a test swaps
   one through a setter.
3. **The transaction**: an AsyncLocalStorage scope (`DECISIONS.md`, "A
   transaction is a scope").

Payload, Keystone, Medusa and Directus inject a context because it carries the
transaction. Strapi keeps a global `strapi` because its transactions live in
AsyncLocalStorage, as ours do.

**Vocabulary:**

- **Reads:** `findOne` returns the row or null; there is also `findMany`,
  `count`, `findBy<X>` and `countBy<X>`.
- **Writes:** `create`, `update`, `delete`, `upsert`, their `…Many` forms,
  and `updateBy<X>`/`deleteBy<X>`.
- **Domain verbs:** a method that encodes a concurrency rule keeps one
  (`claim`, `recordRunAndRelease`, `createIfEmpty`).
- **Resource lists:** `findMany(params)` and `count(params)` take one shape,
  `{ sort, locale, limit, offset }` plus the resource's own filters. Service
  methods keep the public name `query`.
- **Locale fallback:** where a resource falls back, the option is Payload's
  `fallbackLocale`.

## The plan

- **Access.** Each module's repository file exports:
    - `getXRepository()`, backed by `createRegistry` and building its default
      on first use, so boot registers nothing;
    - an `@internal` `setXRepository()` for tests.

    This copies `entries/repository/registry.ts`. Entries keep
    `getEntryRepository(type)`, keyed by type because an entry type can name its
    own repository. The `createXRepository` factory stays module-private, except
    where a test builds one against its own db.

- **Surface.**
    - Each single-table repository wraps `createRepository` privately and
      exposes only named methods. This keeps `notifications.dismiss`'s owner
      filter and the cron claim from being bypassed.
    - Each resource repository hand-picks from the content repository and never
      spreads it. `owners` is private.
- **Layout.**
    - A module's repository is `<module>/repository.ts`, or
      `<module>/repository/` once it needs more than one file.
    - `createRepository` is called only inside repository files, plugins' own
      repository files and tests.
    - Row mappers are module-level `toXRow`.
- **Drift.**
    - `report:drift` lists `createRepository(` and `create…Repository(` calls
      outside repository files and tests.
    - A surface test asserts that users, media, globals and entries each expose
      the shared resource method names.

## The work

One branch, `repository-consistency`, one commit per step, full gate per step.
Once step 2 lands, steps 3 to 7 can run two at a time.

- [x] **1. Rules.**
    - Add the vocabulary, access and layout rules to `.claude/skills/code/SKILL.md`.
    - Add three `DECISIONS.md` entries: no shared resource base (Directus
      rejected), repositories reached through registries, and the vocabulary.
    - Add the `report:drift` patterns.
- [x] **2. Content repository.**
    - Rename `get` to `findOne`, `anyLocale` to `findAnyLocale`, and
      `staging.getByCanonical` to `staging.findOne`. In versions, `list`/`get`
      become `findMany`/`findOne`.
    - Split the `query` namespace: a `kysely()` escape hatch returning
      `{ db, ownerKey, contentKey, joined }` to match the base, with the
      decoding helpers (`rows`, `overlayLocale`, `count`, `list`) as plain
      members.
    - No new read policy.
- [x] **3. Users.**
    - `getUserRepository()` replaces every `createUserRepository(...)` call.
    - Its own `findOne(ref, { fallbackLocale })` includes the account-row step,
      `findMany(params)` and `count(params)` take the shared params, and the
      mapper is `toUserRow`.
    - Named methods replace the `owners` calls: `findAccount`, `updateAccount`,
      `countByRole` and `findIds`.
    - `insertFirstUser` becomes `createIfEmpty(row)` and drops its `db`
      parameter.
    - Delete `users/internal/find-user.ts`, and move the account insert in
      `users/internal/credential-account.ts` onto the repository.
- [x] **4. Media.**
    - `getMediaRepository()` replaces every construction.
    - It gets its own `findOne(ref, { fallbackLocale })`, `findMany` and
      `count`.
    - Named methods replace the `owners` calls in `media/methods/replace.ts`
      and `media/methods/used-by.ts`.
    - Delete `media/internal/find-media.ts`.
    - The account and file reads in `content/usage.ts` move onto the user and
      media repositories.
- [x] **5. Globals.**
    - `getGlobalRepository()` replaces the `globalRepository(config)` wrapper.
    - Hand-pick from the content repository instead of spreading it.
    - `findByKey(key, locale)` becomes one joined read in place of `idByKey`
      plus `get`.
- [x] **6. Entries.** This breaks the public contract for custom repositories.
    - `EntryRepository.get` becomes `findOne`, `list` becomes `findMany` plus
      `count` on the shared params, and `anyLocale` becomes `findAnyLocale`.
    - `tableRepository` and the entries-table repository follow.
    - `entries/internal/read-entry.ts` drops the `config` parameter and the
      double default-locale read.
    - The raw table reads in `entries/internal/relationships.ts` and
      `transport/cli/validate-stored-content.ts` move onto repository methods.
- [x] **7. Single-table repositories and layout.**
    - Notifications: `findByUser`, `countByUser` and `deleteByUser`.
    - Cron keeps its domain verbs.
    - Plugin tracking: `findPackages`, and the file moves to
      `plugins/runtime/repository.ts`.
    - Relationships: `findAll` becomes `findMany`.
    - Maintenance: resolve the handle per call.
    - Move `relationships.ts` and `resource-existence.ts` from
      `database/repository/` to `content/repository/`.
    - `content/relationships.ts` reads through the content repository.
    - Every repository gets its registry accessor.
- [x] **8. Plugins.**
    - The assistant and backups repositories follow the vocabulary.
    - Plugins keep building their repository per call from `ctx.db`, and
      core exports no registry helper (`DECISIONS.md`, "Every repository is
      reached through a registry, built on first use.").
    - Update the plugin note in `exports/index.ts`.
