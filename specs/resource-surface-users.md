# Users on the resource surface

The Users stage of `roadmap/in-progress/resource-surface.md`. Users become the
fourth resource on the three-table shape, with the same translation and
versioning the other three have, and the user delete path clears every author
column in the schema. This file is the design for the branch
`feat/resource-surface-users` and is deleted when it ships.

## Tables

`users` keeps every better-auth column plus `role`, and loses `fields`. It has
no `createdBy` or `updatedBy` (the column template's exception: better-auth owns
the row, and nobody edits a user "as a row"). `users.id` stays a UUID.

`user_content` (`packages/astromech/src/users/tables.ts`, `userContentTable`):

| column                   | rule                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| `id`                     | `col.id()` (ULID), internal                                               |
| `userId`                 | `col.reference(() => usersTable, { notNull: true, onDelete: 'cascade' })` |
| `locale`                 | text, not null                                                            |
| `fields`                 | `col.json()`                                                              |
| `createdAt`, `updatedAt` | timestamps, `updatedAt` with `onUpdate`                                   |
| `createdBy`, `updatedBy` | `col.reference('users', { onDelete: 'set null' })`                        |

Indexes: `idx_user_content_user` on `['userId']`, `user_content_user_locale_unique`
on `['userId', 'locale']`, unique, no `where`. No `status`, `publishedAt`,
`stagedFor`: users declare no statuses or staging.

`user_versions` (`userVersionsTable`): `id`, `contentId` (FK to
`user_content`, not null, cascade), `version` integer not null, `fields`
json, `createdAt`, `createdBy` (`set null`). Index `idx_user_versions_content`
on `['contentId', 'version']`.

`settings.updatedBy` gains `onDelete: 'set null'`, so every author column in
core declares the same rule.

## The user row without a content row

better-auth mints `users` rows outside Astromech's write path (email signup,
and any provider a site enables later). Two things keep the shape whole:

- `users/auth.ts` declares `databaseHooks.user.create.after`, which inserts the
  default-locale `user_content` row (`fields: {}`) for the user just created.
- `createUserRepository().get(id, locale?)` still answers when a user has no
  content row at all: the row reads with `fields: {}`, `locale` the default
  and `locales: []`. This is the one place a resource read tolerates a missing
  content row, and it exists because the row's minting is not ours. A
  `getExact` read never tolerates it, and the first `update` creates the row
  (the content repository's own rule).

Every path that inserts a `users` row directly writes the content row with it:
`packages/astromech/scripts/seed.ts`, `apps/demo/seed.ts`, and the test
harness's `createTestUser`.

## Service

`UsersConfig` gains `translatable?: boolean` (default false), resolved into a
new `ResolvedUsersConfig` on `ResolvedConfig.users`, always present:
`{ fields: Field[]; validate?: ResourceValidator; translatable: boolean }`.

`User`:

```ts
export type User = {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image: string | null;
    /** The locale the content came from. */
    locale: string;
    /** Locales that have a content row, this one included. Sorted. */
    locales: string[];
    fields: JsonObject;
    /** The slug of the user's role, resolved against the config. */
    role: string;
    createdAt: Date;
    /** The account row's last change: profile, email, role. */
    updatedAt: Date;
};

export type UserVersion = {
    id: string;
    userId: string;
    locale: string;
    version: number;
    fields: JsonObject | null;
    createdAt: Date;
    createdBy: string | null;
};
```

`UsersService`:

```ts
query(params?: UserQueryParams): Promise<QueryResult<User>>;   // UserQueryParams gains locale?: string
get(params: { id: string; locale?: string }): Promise<User | null>;
create(params: { data: UserCreateData }): Promise<User>;
update(params: { id: string; locale?: string; data: UserUpdateData }): Promise<User>;
delete(params: { id: string }): Promise<void>;
versions(params: { id: string; locale?: string }): Promise<UserVersion[]>;
restoreVersion(params: { id: string; locale?: string; versionId: string }): Promise<User>;
```

`UserUpdateData = Partial<{ email: string; name: string; fields: JsonObject; role: string }>`,
exported from `types/services.ts`.

Semantics, each the same as media's:

- A `locale` other than the default on a non-translatable config throws
  `UserValidationError`.
- `get` and `query` in a locale with no content row fall back to the default
  locale and say so in `User.locale`.
- `update` in a locale with no content row copies the default-locale row's
  `fields`, applies the patch, and creates the row. `name`, `email` and `role`
  always write the `users` row whatever the locale.
- Every `update` that changes `fields` snapshots the previous content row into
  `user_versions` first. `name`, `email` and `role` changes write no version.
- `versions` and `restoreVersion` address a content row: a locale with none
  throws `UserNotFoundError`. A version belonging to another content row is
  `UserNotFoundError`. Restore snapshots the overwritten state first.
- `update` propagates fields declared `translatable: false` to the other
  locales, through `propagateSharedFields`.
- Each of `create`, `update`, `delete` and `restoreVersion` runs its writes in
  one `transaction()`: the row write, the version, the propagation and the
  relationship-index write together.

`delete`: in one transaction, clear every author column that names the user,
delete the user's relationship-index rows, delete the `users` row (content and
versions cascade).

Errors: `users/errors.ts` with `UserNotFoundError` (`id`, optional `locale`)
and `UserValidationError extends ValidationError`, mirroring `media/errors.ts`.
`UserNotFoundError` joins the 404 branch in the HTTP error middleware.

## Author columns

`entries/internal/clear-author-references.ts` moves to
`users/internal/clear-author-references.ts` and no longer lists tables. It
walks `CORE_TABLES` plus the registered plugin tables, and for every column
whose `reference.target()` resolves to `'users'` or `usersTable`, runs
`updateMany({ [column]: userId }, { [column]: null })`. Today that is the three
entry tables, the three globals tables, the three media tables,
`user_content`, `user_versions` and `settings`. A table added later with an
author column is covered without an edit here.

## Relationships and the CLI

`users/internal/relationships.ts` follows `media/internal/relationships.ts`:
`indexUserRelationships(id)` reads every `user_content` row of the user and
replaces the source's edges with the union; `collectUserRelationshipSources`
reads all users and all content rows. `validate-stored-content.ts`'s
`checkUsers` walks content rows per configured locale, with lookups scoped to
the row's locale.

## Transport

`USERS_ROUTE_SPECS`: `users.query` reads `locale` off the query string;
`users.get` and `users.update` (both bespoke) take `?locale=`; new rows
`{ verb: 'get', path: '/:id/versions', id: 'users.versions', queryArgs: ['locale'] }`
and `{ verb: 'post', path: '/:id/versions/:versionId/restore', id: 'users.restoreVersion', queryArgs: ['locale'] }`.
Contract: `versions` (`users:read`, `mutates: false`), `restoreVersion`
(`users:update`, `mutates: true`). The self-access rule on `get` and `update`
is unchanged; `versions` and `restoreVersion` need the permission.

## Admin

`AdminConfig.users: { translatable: boolean }`. The user edit page
(`admin/pages/_protected/users/$id.tsx`) gains a locale select when
`adminConfig.users.translatable && adminConfig.locales.length > 1`, built the
way the media modal builds its options, and a versions panel beneath the form
(reuse `MediaVersionsPanel`'s shape; a shared `ContentVersionsPanel` is fine if
it falls out naturally). Hooks: `useUser(id, locale?)`, `useUpdateUser(id, { locale })`,
`useUserVersions(id, locale)`, `useRestoreUserVersion(id, locale)`.

## Migration

`apps/demo/migrations/0005_user-content.ts`, generated through
`apps/demo/migrations/ops/0005-user-content.ts` so the generator writes the
snapshot, journal and index, then the emitted body is replaced by hand:

1. `CREATE TABLE user_content`, its two indexes, `CREATE TABLE user_versions`,
   its index (take the DDL the generator emits).
2. `INSERT INTO user_content (id, user_id, locale, fields, created_at, updated_at, created_by, updated_by) SELECT id, id, 'en', fields, created_at, updated_at, NULL, NULL FROM users` (the content row reuses the user id as 0003 did).
3. `ALTER TABLE users DROP COLUMN fields`. SQLite has dropped columns since
   3.35 and `fields` is in no index or constraint, so no rebuild, and the
   author FKs that reference `users` are left alone.
4. The `settings` rebuild the generator emits for the `onDelete` change, kept
   as emitted (nothing references `settings`).

The ops file declares `createTable` for the two new tables, `rebuildTable`
for `users` and `rebuildTable` for `settings`, in that order.
`apps/demo-cloudflare/migrations/0000_migration.ts` and its `snapshot.json`
are hand-edited to the new baseline.

## Decisions this stage makes

- **A user row without a content row reads as empty content.** better-auth
  mints the row; the hook that adds the content row is ours but runs after
  better-auth's insert, and a provider added later may not run it. A session
  must not fail on a profile nobody has written. Rejected: a strict inner join
  (locks out a user whose content row is missing), and a lazy insert on read
  (a write in a read path).
- **Only `fields` is versioned.** `name`, `email`, `image` and `role` are the
  account row, which better-auth and the roles machinery own; a version of a
  profile is a version of what the site's own fields say.
- **Author clearing enumerates columns from the table descriptors.** The
  hand-kept list under `entries/internal/` was three tables when nine carried
  the column. Rejected: relying on `ON DELETE set null` (libSQL does not
  enforce foreign keys).
- **`settings.updatedBy` is `set null`** like every other author column.
