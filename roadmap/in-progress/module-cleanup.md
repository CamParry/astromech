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
- [ ] **A staged slug is lost at merge.** `entries/methods/staging/merge.ts`
      writes only the staged `title` and `fields`. Carry the slug, or refuse a
      slug in a staged write.
- [x] **The command palette ignores read permissions.** It rebuilds the sidebar's
      nav (`packages/admin/src/components/ui/command-palette.tsx`) without
      `canReadMedia`/`canReadUsers`, and omits globals and app pages. Build both
      from one `useAdminNav()`.
- [x] **Creating a user toasts "User updated."** (`packages/admin/src/`, the users
      mutation table).

## Copies

- [ ] **Media and users methods.** `versions/{list,get,restore}.ts`, `get.ts`,
      `query.ts`, `update.ts` and `relationships.ts` differ only in names, schema
      and access string. `DECISIONS.md` rejected a `createVersionsMethods`
      factory; revisit that for these two, whose addressing and output shape
      match.
- [ ] **Each resource drops its relationship rows on delete in its own place.**
      Media and users do it in their repository's `delete`; entries do it in
      `emptyTrash` (`entries/methods/empty-trash.ts`), `deleteEntryBatch`
      (`entries/internal/delete-batch.ts`) and `trashPurgeJob`
      (`entries/jobs/trash-purge.ts`). Move the drop into the content
      repository's `delete`, which changes entries too.
- [ ] **Entries build their own relationship index.** `entries/relationships.ts`
      repeats `createContentRelationships` (`content/relationships.ts`) plus three
      repository reads only it uses. Add a type filter and bind entries through
      the factory.
- [ ] **The staging merge exists twice, with two merge rules.**
      `entries/methods/staging/merge.ts` takes the staged fields as they are;
      `globals/methods/staging/merge.ts` patches them over the canonical. One
      helper in `content/staging.ts`, one rule.
- [x] **The entry catalogue restates every method.** `entries/catalogue.ts` repeats
      each summary in a switch and each input in a per-type builder. Build each
      from the method's own `input` with `safeExtend` and its `summary`.
- [ ] **The five services are listed by hand four times** in
      `app-context/services.ts` and `app-context/app-context.ts`. Loop over
      `DEFINITIONS`. Moving `currentServices` into `app-context.ts` also breaks
      the import cycle between the two files.
- [ ] **Find-a-method-and-call-it exists three times**: `callOn`
      (`policies/call-method.ts`), `invoke` (`transport/http/routes/rest-route.ts`)
      and `forwardToCurrent` (`app-context/services.ts`).
- [ ] **JSON body reading and the plain-object check** repeat across
      `rest-route.ts`, `transport/http/routes/entries.ts`, the RPC transport, the
      query-string parser and the CLI `call` command.
- [ ] **`parseInput` and `parseMethodInput`** both parse and throw a 422
      (`errors/validation.ts`, `services/parse-method-input.ts`).
- [ ] **Admin: the media page bypasses `<DataList>`**, hand-rolling URL state,
      selection, bulk actions and the table. Entry create and entry/global update
      bypass the mutation table. The list-to-query mapping is written four times;
      have `useListState` return it.
- [ ] **Admin: three permission-denied behaviours** (redirect in an effect, toast
      then redirect, banner) and none on the media page or entries list. One
      guard.
- [ ] **Plugins rebuild the API base URL** from a private build global
      (`@astromech/backups`, `@astromech/assistant`). Add a route helper to the
      plugin context; rename its misnamed `modal` to `confirm`.
- [x] **Entry create and a new translation derive the title, status, slug and
      fields the same way** (`entries/methods/create.ts` and `planTranslation`
      in `entries/internal/update-batch.ts`), which `report:drift` lists;
      `entries/methods/duplicate.ts` writes its copy without either (no field
      parse, no create hooks). Share one derivation.
- [ ] **The admin derives a media extension on its own.** `packages/admin/src/components/media/media-thumb.tsx` keeps a copy of core's `extOf` (`packages/astromech/src/media/internal/keys.ts`), which now lower-cases the extension. Serving reads the extension from the row, so the copy is harmless today; export one from `astromech/shared` and use it.
- [ ] Smaller: the two identical `VersionsPanel` wrappers in the admin; the two
      no-op cron drivers; `quoteName`/`quoteLiteral` in `packages/schema-engine`.

## Code in the wrong place

- [ ] `transport/http/routes/rest-route.ts` serves routes and writes the OpenAPI
      document. Split the documentation half out, and share one path-param regex.
- [ ] `transport/cli/relationship-index.ts` and
      `transport/cli/validate-stored-content.ts` are content logic. Move them to
      `content/`.
- [ ] `globals/schema.ts` imports status and date schemas from `entries/schema.ts`,
      and `content/prepare-fields.ts` imports `entries/validation-mode.ts`. Move all
      four to `content/`.
- [ ] `types/` holds contracts away from their owners (driver contracts, admin
      resource types, service interfaces) and imports every module's schema.
      Move each next to its owner, keep `types/index.ts` as the public list.
      Start with the driver contracts. Admin-only render types in
      `types/resolved.ts` move to `packages/admin`.
- [ ] `RESOURCE_TYPES` sits in `types/domain.ts`, apart from `RESOURCE_CONFIG`
      in `content/resources.ts`. Moving it there leaves it undefined at load
      time: `content/schema.ts` builds `usageSchema` from it, and
      `content/resources.ts` imports the resource schemas, which import
      `content/schema.ts`. Break that cycle first.
- [ ] `utilities/` is a mixed bag: `ai-context.ts` to `ai/`, `locale.ts` to its
      one consumer. `permission-match.ts` is in `planned/permissions.md`.
- [ ] The plugin runtime keeps its own config copy with its own defaults
      (`plugins/runtime/plugin-runtime.ts`); read `app.config`.
- [ ] `MediaQueryParams` and `UserQueryParams` are hand-written copies of their
      schemas (`types/query.ts`). Derive them.
- [ ] Generic form code is named as entry code in the admin
      (`components/entries/entry-fields-renderer.tsx`, `EntryNamespaceProvider`).
- [ ] `packages/schema-engine/src/generate.ts` mixes migration generation with a
      rebaseline parser. Split it.

## Dead or near-dead

- [ ] `sortPage` in the admin list controller (see the `sortable` item in
      `backlog.md`).
- [ ] The `notifications.count` special cases: a bespoke route, a documented
      override and a client override, all to answer `{ data: { count } }`.
- [ ] `globals.get({ staged })`, which only a test uses; the admin calls
      `getStaged`.
- [ ] `CELL_KINDS`, `badRequest`'s `details`, the
      unreachable try/catch in `transport/mcp/tools.ts`, and
      `createEntriesService`'s two parameters that only ever take one value.
- [ ] Two unrelated `pluginNamespace` exports; rename the Proxy builder.
- [ ] `SlugConfig`'s `source` and `prefix` (`types/config.ts`): nothing reads
      them, since a slug always derives from the title.

## Public API

- [ ] `config.entries` is a keyed record while globals and plugin entry types are
      arrays, so `EntryType.type` is optional and checked at runtime for plugins.
      Make it an array of `defineEntryType` objects with a required `type`.
