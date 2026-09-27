# Module clean-up

From a read-only review of every package (2026-09-27). Paths are under
`packages/astromech/src/` unless they name a package. `completed/service-method-readability.md`
holds the method-level fixes; `planned/media-users-repository-copies.md` holds
the repository copies.

## Defects to confirm with a test first

- [ ] **Re-publishing an entry clears its `publishedAt`.** `publish` passes
      `publishedAt: null` (`entries/methods/status.ts`), and
      `entries/internal/update-batch.ts` writes it when the row already has a
      date. The class: `publishedAt` is stamped in six places under three rules
      (`update-batch.ts` twice, `entries/methods/create.ts`,
      `entries/methods/duplicate.ts`, `globals/methods/update.ts`,
      `globals/methods/status.ts`). Give it one helper in `content/`, and decide
      whether a status change fires the update hooks: an entry's does, a
      global's does not.
- [ ] **`globals.createStaged` stores fields unvalidated.** It merges `data.fields`
      over the canonical and stores the result without the field parse
      (`globals/methods/staging/create.ts`), so no validation, no repeater ids,
      and an index built from raw input. Drop `data`, as `entries.createStaged`
      has, or parse it. An entry staged update may also write `status`, which
      globals refuse.
- [ ] **`valuesEqual` depends on key order.** `utilities/values-equal.ts` compares
      with `JSON.stringify`, so a `unique` check sees `{a,b}` and `{b,a}` as
      different. Keep only `utilities/deep-equal.ts`.
- [ ] **The command palette ignores read permissions.** It rebuilds the sidebar's
      nav (`packages/admin/src/components/ui/command-palette.tsx`) without
      `canReadMedia`/`canReadUsers`, and omits globals and app pages. Build both
      from one `useAdminNav()`.
- [ ] **Creating a user toasts "User updated."** (`packages/admin/src/`, the users
      mutation table).
- [ ] **A plugin method's string or function `access` reads as allowed.** The
      manifest carries core access as `permission` + `permissionDynamic` and
      plugin access as `access` + `permission` (`codegen/method-manifest.ts`), so
      `policies/annotate-manifest.ts` branches on source and annotates those forms
      `allowed: true`. No first-party plugin uses them. Give every manifest
      method one access shape, read through `permissions/access.ts`.

## Copies

- [ ] **Media and users methods.** `versions/{list,get,restore}.ts`, `get.ts`,
      `query.ts`, `update.ts` and `relationships.ts` differ only in names, schema
      and access string. `DECISIONS.md` rejected a `createVersionsMethods`
      factory; revisit that for these two, whose addressing and output shape
      match.
- [ ] **Entries build their own relationship index.** `entries/relationships.ts`
      repeats `createContentRelationships` (`content/relationships.ts`) plus three
      repository reads only it uses. Add a type filter and bind entries through
      the factory.
- [ ] **The staging merge exists twice, with two merge rules.**
      `entries/methods/staging/merge.ts` takes the staged fields as they are;
      `globals/methods/staging/merge.ts` patches them over the canonical. One
      helper in `content/staging.ts`, one rule.
- [ ] **The entry catalogue restates every method.** `entries/catalogue.ts` repeats
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
- [ ] **Entry create and duplicate derive the title, status, slug and fields the
      same way** (`entries/methods/create.ts` and the duplicate path in
      `entries/internal/update-batch.ts`), which `report:drift` lists. Share it
      with the `publishedAt` helper above.
- [ ] Smaller: the two identical `VersionsPanel` wrappers in the admin; the two
      no-op cron drivers; `quoteName`/`quoteLiteral` in `packages/schema-engine`;
      the exclusion count in the MCP and CLI `methods` listings.

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
- [ ] `utilities/` is a mixed bag: `ai-context.ts` to `ai/`,
      `permission-match.ts` to `permissions/`, `locale.ts` to its one consumer.
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
- [ ] `defineAbsolutePermissions`, `CELL_KINDS`, `badRequest`'s `details`, the
      unreachable try/catch in `transport/mcp/tools.ts`, and
      `createEntriesService`'s two parameters that only ever take one value.
- [ ] Two unrelated `pluginNamespace` exports; rename the Proxy builder.

## Public API

- [ ] `config.entries` is a keyed record while globals and plugin entry types are
      arrays, so `EntryType.type` is optional and checked at runtime for plugins.
      Make it an array of `defineEntryType` objects with a required `type`.
