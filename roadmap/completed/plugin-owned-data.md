# Plugin-owned data

Redirects and form submissions stop being entry types. Each becomes the
plugin's own data, with its own table, repository, service methods and
permissions. The plugin gets list and edit screens from admin components that
know nothing about storage. With no custom-table entry types left, entry types
have one storage, and every core repository becomes a plain module-level
object.

## Why

Checked against the code on 2026-09-25.

- **Our entry is a heavy model.** It has three tables, locales, staging,
  versions, slugs and statuses. Payload can treat everything as a collection
  because its collection is thin: versions, drafts, trash and localisation are
  off unless asked for. Our entry is closer to a WordPress post or a Craft
  Element. In those ecosystems, lookup data leaves the content model:
  WordPress's Redirection plugin uses its own tables and REST namespace, and
  Craft's Retour uses plain records read with a raw query.
- **Custom-table entry types cost about 760 lines of core.** These include
  `TableRepository` (431 lines), the keyed repository registry, the optional
  `EntryRepository` members, `supports` gating, and separate branches in
  queries, relationships, dangling-reference checks, the validation CLI and
  the command palette. The path also produced four recorded defects
  (`roadmap/completed/custom-table-relations.md`).
- **Only two entry types use it, and both fit badly:**
    - A redirect is looked up by path on every request. Today that lookup goes
      through `ctx.entries.query` with visibility handling and `limit: 'all'`,
      over a table with no index on `from`. It has different writers (the
      slug-change hook, the seed) and different access rules from content.
    - A submission has no versions, locales, slugs or statuses. It is
      read-only only because the demo config withholds a permission.
- **The repository registries protect nothing.** `createUserRepository()` and
  its siblings capture only table names and column lists; the db handle and
  the default locale are read on every call. Only one test per repository
  uses the setter, and `vi.spyOn` does the same job. None of the projects
  checked (Payload, Strapi, Directus, Medusa, Keystone, Ghost, Cal.com, Epic
  Stack, better-auth, Umami) gives a repository its own replaceable slot on
  `globalThis`. They keep one slot for the database client, which is state.
- **Admin frameworks share UI, not storage.** In Django admin, Filament,
  react-admin and Refine, the table and form components know nothing about
  storage. Only the binding changes: a resource name plus a data provider,
  or a model plus a query. Each view (list, create, edit, show) is optional.

## Decisions

- **A repository is a plain module-level object**, built when its module
  loads: `export const userRepository = { findOne, … }`. Tests replace a
  method with `vi.spyOn(userRepository, 'countByRole')`, and vitest restores
  every spy after each test (`restoreMocks: true`). Registries stay for state
  set at boot or chosen per site: the db, config, storage and email.
  `createRepository(table)` and `createContentRepository(...)` stay as tools.
  Plugins keep building theirs per call from `ctx.db`.
- **Entry types have one storage.** `tableRepository`, an entry type's
  `repository`, the keyed override registry and `supports` gating go. The
  entries-table repository becomes `entryRepository`, and the `EntryRepository`
  interface goes with the second implementation.
- **A plugin's data lives in the plugin.** It has its own table, a repository
  built with `createRepository(ctx.db)`, and service methods (`list`, `get`,
  `create`, `update`, `delete`), each with `access: { permission }`. Input is
  checked with `parseFields` against the plugin's field definitions, so fields
  stay the one schema language, and a 422 fills in the admin form's errors.
- **An admin resource** is a plugin's declaration of list, create and edit
  screens over its own service methods. Each view is optional, and there is
  no separate view page: an edit screen without an update method renders
  read-only. The admin hides create, edit and delete when the user lacks the
  permission of the method behind it. The name follows react-admin and
  Filament. Bare "resource" stays reserved for entries, globals, media and
  users.

## The plan

- **Admin components.**
    - List: `useListState()` holds search, sort, page and selection in the
      URL, and `<DataList>` renders columns, rows, sort, search, pagination,
      bulk delete, a row link and row actions. It takes data and callbacks,
      not method names, and ships from `astromech/ui`.
    - Form: `useFieldsForm()` and `<FieldsForm>`, over the existing field
      renderer. The hook takes the field definitions, the operation, default
      values, a submit function and a read-only flag. It ships from
      `astromech/ui/app`, because the field renderer imports a virtual module
      that plain Node cannot load.
    - `useListController` and `useEntryForm` build on these and keep the
      entry-only parts (status, locale, trash, staging, versions).
    - `CellRendererProps.entry` becomes `row`, because plugin rows are flat.
      This changes a public type.
- **Admin resources.** `defineAdminResource` under a plugin's
  `admin.resources`. Boot checks that every named method exists in the
  plugin's service, and resolves each method's permission into
  `AdminConfig.plugins[]`, where the admin checks it with `hasPermission`.
  Generic pages live under `pages/_protected/plugin/$name/resources/…`, next
  to the plugin entry routes, which stay: forms' `form` entry type uses them.
- **Redirects.** A unique index on `from`, shipped as the plugin's first
  non-baseline migration (`astromech plugin:generate`). Nothing is deployed,
  so no existing duplicates need merging first. `findByFrom(path)` backs the
  public `lookup` method. The slug-change hook and the seed write through the
  repository or the service. The plugin gets a `definePermissions` file like
  backups.
- **Form submissions.** Service methods `list`, `get` and `delete`, and an
  admin resource with a read-only edit screen. Save-and-continue, if it comes,
  is a `status` column and a resume token on the same table, not versions.
- **Entries.** `entryRepository` is a module-level object. Every custom-table
  branch goes. Any entry-type option that only these two types used
  (`titleField: false`, `statuses: false`, `slug: false`, `trash: false`,
  `search`) goes too, unless another type still uses it.
- **Out of scope.** The media list and its upload modal stay as they are:
  their grid and upload flow fit `<DataList>` poorly. Moving them is a
  follow-up if the list component proves itself.

## The work

One branch, `plugin-owned-data`, one commit per step, full gate per step.
Steps 3 and 4, and steps 6 and 7, ran in parallel and share files, so each
pair landed as one commit.
Steps 2, 3 and 4 can run in parallel. Step 5 needs 3 and 4. Steps 6 and 7 need
5 and can run in parallel. Step 8 needs 2, 6 and 7. Run `check:boot` after 5,
6, 7 and 8.

- [x] **1. Rules.**
    - `DECISIONS.md`:
        - Rewrite "Every repository is reached through a registry" as the
          module-object rule.
        - Replace the custom-table entries (lines 141, 143, 145 and 155) with
          "entry types have one storage; a plugin's data lives in the plugin".
        - Add "An admin resource binds admin views to a plugin's methods".
        - Add "admin resource" to "Reserved words".
    - `.claude/skills/code/SKILL.md`, "Data access": the module-object rule and
      the plugin rule.
- [x] **2. Core repositories as module objects.**
    - Covers users, media, globals, notifications, cron, plugin tracking,
      relationships, resource existence and entry maintenance.
    - Their tests swap methods with `vi.spyOn`. Add `restoreMocks: true` to
      `packages/astromech/vitest.config.ts`: suites run with `isolate: false`,
      and the isolation check does not see a spy.
    - `ARCHITECTURE.md` ("no module-scope singletons") says why a stateless
      object is the exception.
- [x] **3. Admin list.** `useListState` and `<DataList>`. The entries list and
      the users list move onto them. `CellRendererProps.entry` becomes `row`.
- [x] **4. Admin form.** `useFieldsForm` and `<FieldsForm>` with a read-only
      mode. `useEntryForm` and the users edit and new pages move onto them.
- [x] **5. Admin resources.** The core type and `defineAdminResource`, the admin
      config with method permissions, the nav, the routes and the generic
      pages. If knip rejects an export only tests use, land it with step 6.
- [x] **6. Redirects.** The table and its migration, the repository,
      permissions, service methods, `lookup`, the slug-change hook, the admin
      resource, tests, README and docs, and the demo config and seed.
- [x] **7. Form submissions.** The service methods, the read-only admin
      resource, tests, README and docs, and the demo config.
- [x] **8. One entry storage.**
    - `entryRepository` becomes a module object.
    - Delete `entries/repository/registry.ts`, `entries/repository/table.ts`,
      the `EntryRepository` interface and `createLazyRegistry`.
    - Remove every custom-table branch, and the entry-type options left
      unused.
    - Update `TERMINOLOGY.md` ("Custom table"), `ARCHITECTURE.md`,
      `roadmap/backlog.md` and the docs pages that name custom-table entry
      types.
