---
milestone: 1.0
---

# Module clean-up

From a read-only review of every package (2026-09-27). Paths are under
`packages/astromech/src/` unless they name a package. `completed/service-method-readability.md`
holds the method-level fixes; `completed/media-users-repository-copies.md` holds
the repository copies.

## Defects to confirm with a test first

- [x] **Re-publishing an entry clears its `publishedAt`.** `publish` passes
      `publishedAt: null` (`entries/methods/publish.ts`), and
      `entries/internal/update-batch.ts` writes it when the row already has a
      date. The class: `publishedAt` is stamped in six places under three rules
      (`update-batch.ts` twice, `entries/methods/create.ts`,
      `entries/methods/duplicate.ts`, `globals/methods/update.ts`,
      `globals/methods/publish.ts`). Give it one helper in `content/`, and decide
      whether a status change fires the update hooks: an entry's does, a
      global's does not. The same class, found reading the code:
    - [x] Publishing a scheduled global keeps its future `publishedAt`, so it
          stays hidden while reporting `published`.
    - [x] `entries.create` ignores a caller's `publishedAt` when the status is
          `published`; `globals.update` honours it.
    - [x] `entries.publish` and `globals.publish` may skip the `required` check:
          only a write with a fields patch validates in complete mode.
    - [x] A scheduled global never goes live. The `scheduled-publish` job moved
          entries only, and the public read hides any status other than
          `published`. The job now sits in `content/jobs/scheduled-publish.ts`
          and moves globals too.
    - [x] The scheduler publishes with one bulk write per resource
          (`entries/repository/maintenance.ts`, `globals/repository.ts`), so no
          update hook fires when a scheduled row goes live. Publishing through
          the update path also removes the two copies of that write. The job
          now reads the due rows and publishes each through `update`.
- [x] **`globals.createStaged` stores fields unvalidated.** It merges `data.fields`
      over the canonical and stores the result without the field parse
      (`globals/methods/staging/create.ts`), so no validation, no repeater ids,
      and an index built from raw input. Drop `data`, as `entries.createStaged`
      has, or parse it. An entry staged update may also write `status`, which
      globals refuse.
- [x] **A staged slug is lost at merge.** `entries/methods/staging/merge.ts`
      writes only the staged `title` and `fields`. Carry the slug, or refuse a
      slug in a staged write. Carried: a staged write already stores a slug,
      and the admin shows the slug field on a staged change. A live slug
      change (update, version restore, restore) also moves a staged slug that
      still holds the old one, so the merge carries only an edited slug, and
      one a live entry took meanwhile takes the next free one.
- [x] **The command palette ignores read permissions.** It rebuilds the sidebar's
      nav (`packages/admin/src/components/ui/command-palette.tsx`) without
      `canReadMedia`/`canReadUsers`, and omits globals and app pages. Build both
      from one `useAdminNav()`.
- [x] **Creating a user toasts "User updated."** (`packages/admin/src/`, the users
      mutation table).

## Copies

- [x] **Media and users methods.** `versions/{list,get,restore}.ts`, `get.ts`,
      `query.ts`, `update.ts` and `relationships.ts` differ only in names, schema
      and access string. `DECISIONS.md` rejected a `createVersionsMethods`
      factory; revisit that for these two, whose addressing and output shape
      match. Kept apart: a factory shared by two of the four resources is not
      worth it, since entries and globals already differ from them and the two
      may drift apart too. `DECISIONS.md` now says so.
- [x] **Each resource drops its relationship rows on delete in its own place.**
      Media and users do it in their repository's `delete`; entries do it in
      `emptyTrash` (`entries/methods/empty-trash.ts`), `deleteEntryBatch`
      (`entries/internal/delete-batch.ts`) and `trashPurgeJob`
      (`entries/jobs/trash-purge.ts`). Move the drop into the content
      repository's `delete`, which changes entries too. Done in each repository
      delete instead: `entryRepository.delete`, `trash.emptyTrash` and
      `entryMaintenanceRepository.purgeTrashedBefore` now drop their own rows,
      as media's and users' `delete` already did, so no method or job calls
      `relationshipRepository`. Not `content.delete`: users' guarded delete and
      the two bulk entry deletes do not go through it, and it would need a
      resource kind globals cannot give. `tests/content/delete-relationship-rows.test.ts`
      checks all five.
- [x] **Entries build their own relationship index.** `entries/relationships.ts`
      repeats `createContentRelationships` (`content/relationships.ts`) plus three
      repository reads only it uses. Add a type filter and bind entries through
      the factory. Done, but the three reads stay: `validate-stored-content.ts`
      and `entries/methods/restore.ts` use them too. The factory's `all` filters
      by `sourceType` after reading, so `--type` reads every entry row.
- [x] **The staging merge exists twice, with two merge rules.**
      `entries/methods/staging/merge.ts` takes the staged fields as they are;
      `globals/methods/staging/merge.ts` patches them over the canonical. One
      helper in `content/staging.ts`, one rule. Superseded:
      `roadmap/planned/drafts.md` removes staging and its merge step.
- [x] **The entry catalogue restates every method.** `entries/catalogue.ts` repeats
      each summary in a switch and each input in a per-type builder. Build each
      from the method's own `input` with `safeExtend` and its `summary`.
- [x] **The five services are listed by hand four times** in
      `app-context/services.ts` and `app-context/app-context.ts`. Loop over
      `DEFINITIONS`. Moving `currentServices` into `app-context.ts` also breaks
      the import cycle between the two files. Done for all six services: each
      list now loops over the keys of `DEFINITIONS`. `currentServices`
      stayed put: the move would not break the cycle, since `services.ts` still
      reaches `app-context.ts` through `plugins/runtime/plugin-services.ts` and
      `plugin-runtime.ts`, and `app-context.ts` reaches `services.ts` through
      `transport/tools/scoped-tools.ts` and `policies/call-method.ts`.
- [x] **Find-a-method-and-call-it exists three times**: `callOn`
      (`policies/call-method.ts`), `invoke` (`transport/http/routes/rest-route.ts`)
      and `forwardToCurrent` (`app-context/services.ts`). All three call
      `callServiceMethod` (`services/call-service-method.ts`), a leaf module
      so no new import edge joins the cycle; each passes its own error message.
- [x] **JSON body reading and the plain-object check** repeat across
      `rest-route.ts`, `transport/http/routes/entries.ts`, the RPC transport, the
      query-string parser and the CLI `call` command. The check is `isRecord`
      in `utilities/is-record.ts`, used by every copy that means a JSON object,
      in `fields/`, `content/` and `services/` too. It is not `isPlainObject`:
      lodash's and `is-plain-obj`'s also check the prototype, and this one does
      not. `readJsonBody` and `readJsonObject` in
      `transport/http/routes/json-body.ts` answer the two 400s for the REST
      routes and the cross-type entry routes; the RPC and plugin routes still
      read the body their own way.
- [x] **`parseInput` and `parseMethodInput`** both parse and throw a 422
      (`errors/validation.ts`, `services/parse-method-input.ts`).
      `parseMethodInput` now calls `parseInput`, keeping only its own rule
      that no argument is the empty object.
- [x] **Admin: the media page bypasses `<DataList>`**, hand-rolling URL state,
      selection, bulk actions and the table. Entry create and entry/global update
      bypass the mutation table. The list-to-query mapping is written four times;
      have `useListState` return it. All three parts are done: `useListState`
      returns `queryParams`, which the users, admin resource and entries lists
      and the media picker's `useMediaBrowser` share; `MediaListPage` is a
      `<DataList>` over `useListState`, its grid a `renderBody` that `DataList`
      hands the selection, with `sort=key:dir` in the URL; and entry create and
      entry and global update are `create` and `update` rows in `entryMutations`
      and `globalMutations`, whose `update` writes the saved row to its key
      before the invalidation. A create now also refreshes the dashboard counts.
- [x] **Admin: three permission-denied behaviours** (redirect in an effect, toast
      then redirect, banner) and none on the media page or entries list. One
      guard. Every page now returns `ForbiddenPage`
      (`packages/admin/src/components/layout/forbidden-page.tsx`, beside
      `NotFoundPage`) in place, above the hooks that fetch, so the URL stays and
      no request is made; the entry and global edit and versions pages, which
      had no check either, use it too.
- [x] **Plugins rebuild the API base URL** from a private build global
      (`@astromech/backups`, `@astromech/assistant`). Add a route helper to the
      plugin context; rename its misnamed `modal` to `confirm`. The helper is
      `rawRouteUrl(path)` on `useAstromechPlugin()`, after the `rawRoutes` it
      reaches.
- [x] **Entry create and a new translation derive the title, status, slug and
      fields the same way** (`entries/methods/create.ts` and `planTranslation`
      in `entries/internal/update-batch.ts`), which `report:drift` lists;
      `entries/methods/duplicate.ts` writes its copy without either (no field
      parse, no create hooks). Share one derivation.
- [x] **The admin derives a media extension on its own.** `packages/admin/src/components/media/media-thumb.tsx` keeps a copy of core's `extOf` (`packages/astromech/src/media/internal/keys.ts`), which now lower-cases the extension. Serving reads the extension from the row, so the copy is harmless today; export one from `astromech/shared` and use it. Now `fileExtension` in `media/file-extension.ts`, outside `internal/` so the shared entry may import it.
- [x] Smaller: the two no-op cron drivers. `SchedulerDriver.start` is now
      optional, so `cloudflareCron()` and `webhook()` return only a `name`.

## Code in the wrong place

- [x] `transport/http/routes/rest-route.ts` serves routes and writes the OpenAPI
      document. Split the documentation half out, and share one path-param regex.
      The documentation half is now `rest-route-document.ts`. The input-schema
      readers both halves use moved to `method-input.ts`, and the path-param
      regex and method-id splitting to `http-routes.ts`, which the browser
      client may also import.
- [x] The relationship index rebuild and the stored-content validation report
      in `transport/cli/` are content logic. Move them to `content/`. Both
      moved whole, since neither held CLI code: `content/relationship-index.ts`
      and `content/validate-stored-content.ts`. The rebuild and drift check now
      take the config as their first argument, since a `content/` file may not
      read the config registry.
- [x] `globals/schema.ts` imports status and date schemas from `entries/schema.ts`,
      and `content/prepare-fields.ts` imports the validation mode from `entries/`. Move all
      four to `content/`. The schemas are in `content/schema.ts`, with
      `scheduleEntrySchema` renamed `scheduleSchema` (globals now import it
      rather than alias it); `entryValidationMode` is `resolveValidationMode` in
      `content/validation-mode.ts`, since users and media reach it too.
- [x] `types/` holds contracts away from their owners (driver contracts, admin
      resource types, service interfaces) and imports every module's schema.
      Move each next to its owner, keep `types/index.ts` as the public list.
      Start with the driver contracts. Admin-only render types move to
      `packages/admin`. Done in four steps: each driver contract is in a
      `driver.ts` beside its module's `drivers/`, the render types are in the
      admin's `rendering/types.ts`, the admin resource types are in
      `plugins/admin-resource.ts`, and each service type and its input types
      are in its module's `service-types.ts` (the typed facades in
      `entries/typed-entries.ts` and `globals/typed-globals.ts`, `Usage` in
      `types/domain.ts`), leaving `types/services.ts` with only the
      `Services` and `TypedServices` aggregates.
- [x] `RESOURCE_TYPES` sits in `types/domain.ts`, apart from `RESOURCE_CONFIG`
      in `content/resources.ts`. Moving it there leaves it undefined at load
      time: `content/schema.ts` builds `usageSchema` from it, and
      `content/resources.ts` imports the resource schemas, which import
      `content/schema.ts`. Break that cycle first. `RESOURCE_TYPES` and
      `TARGET_KINDS` are now in `content/resource-types.ts`, a leaf beside
      `resources.ts` that imports nothing; `types/domain.ts` keeps the
      `ResourceType` and `TargetKind` types, derived type-only. Not
      `resources.ts` itself: `content/schema.ts` and `database/tables.ts`
      build enums from the constants at load time, and importing
      `resources.ts` would load every resource's schema into both, which is
      the cycle.
- [x] `utilities/` is a mixed bag: `ai-context.ts` to `ai/`, `locale.ts` to its
      one consumer. `permission-match.ts` is in `planned/permissions.md`. The
      AI context message is `ai/context-message.ts`. `locale.ts` stays: ten
      files across six modules import it, and the admin and the demo reach it
      through `astromech/shared`, so it is a pure leaf with no single owner.
- [x] The plugin runtime keeps its own config copy with its own defaults
      (`plugins/runtime/plugin-runtime.ts`); read `app.config`. `ctx.config`
      is now a getter over `app.config`, so `registerPlugins` no longer takes
      the config.
- [x] `MediaQueryParams` and `UserQueryParams` are hand-written copies of their
      schemas (`types/query.ts`). Derive them. The query methods' inputs moved
      to `queryMediaSchema` and `queryUsersSchema` in each module's
      `schema.ts`, and both types are `z.input` of them.
- [x] Generic form code is named as entry code in the admin
      (`entry-fields-renderer.tsx` in `components/entries/`,
      `EntryNamespaceProvider`). The renderer is now
      `components/fields/field-list.tsx`, its root column `FieldValuesColumn`
      (`FieldColumn` is the public form-bound one), and the provider
      `LabelNamespaceProvider` in `i18n/label-namespace.tsx`.
- [x] `packages/schema-engine/src/generate.ts` mixes migration generation with a
      rebaseline parser. Split it. The parser and its checks are in
      `packages/schema-engine/src/rebaseline.ts`, with no `node:fs`;
      `rebaselineMigrations` stays in `generate.ts` beside the other reads and
      writes of the migrations directory.

## Dead or near-dead

- [x] `sortPage` in the admin list controller (see the `sortable` item in
      `backlog.md`). Gone: the entries repository now sorts by a top-level
      field whose type is `sortable`, by its bare name, and config resolve
      refuses a `sortable` admin column the list cannot sort by.
- [x] The `notifications.count` special cases: a bespoke route, a documented
      override and a client override, all to answer `{ data: { count } }`.
      All three went: `GET /notifications/count` is a table row and answers
      `{ data: number }`, as RPC and `POST /entries/count` already did.
- [x] `globals.get({ staged })`, which only a test uses; the admin calls
      `getStaged`. Superseded: `roadmap/planned/drafts.md` removes staging.
- [x] `CELL_KINDS`, `badRequest`'s `details`, the
      unreachable try/catch in `transport/mcp/tools.ts`, and
      `createEntriesService`'s two parameters that only ever take one value.
      `createEntriesService` went too: no docs named it, so the entries
      handle is built like the other services, and `callRoute` lost its
      `base` override.
- [x] Two unrelated `pluginNamespace` exports; rename the Proxy builder. It is
      `createPluginServices`, after `createServices` and `createPluginContext`.
- [x] `SlugConfig`'s `source` and `prefix` (`types/config.ts`): nothing reads
      them, since a slug always derives from the title. **Needs a decision
      first:** the `slug` object's presence is what shows the slug input in
      the admin (`config/admin-config.ts` sends `slug: null` without it, and
      the admin's `resolve.ts` sets `hasSlug` from it), so a type with the
      slug capability on but no `slug` object generates slugs the form cannot
      edit. Either show the input whenever `capabilities.slug` is on and drop
      `SlugConfig`, or make `slug` a boolean. The `entry-types` route's
      response schema lists both fields too. Done: the input now follows
      `capabilities.slug`, and `slug` is a boolean.

## Public API

- [ ] `config.entries` is a keyed record while globals and plugin entry types are
      arrays, so `EntryType.type` is optional and checked at runtime for plugins.
      Make it an array of `defineEntryType` objects with a required `type`.
