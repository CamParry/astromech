# Audit findings, September 2026

Every finding from the read-only audit of 2026-09-22, which covered request
call depth, `AppContext` against the request store, module consistency, and
duplication. A finding that belongs to a feature file is one line here with a
link; this file holds the detail only for findings that have no other home.
Tick a line when its work lands, and delete this file once every line is ticked.

## Scheduled in their own files

- [ ] Publish-permission bypass, REST-only field-capability checks, REST-only
      last-admin guard, domain errors answering 500, CLI commands that never
      boot the app, `users:create` bypassing the service, plugin reads that
      expose drafts (menus), the hardcoded `'en'` locale and `scopeEntries`
      drift: `planned/policy-in-the-service-layer.md`.
- [ ] Hooks and plugin calls rebuilding context from the store, user and role
      held in three places, the uncached system context, `CronContext`, the
      session resolved twice per API request, and the request-scope rename:
      `planned/explicit-app-context.md`.
- [ ] The unused `settings` module: `planned/remove-settings-module.md`.
- [ ] Plugin field types never validated on the server, and dead
      `serverValidate`: `planned/plugin-field-types-in-the-registry.md`.
- [ ] Globals missing from the relationships index, and users and media
      missing from the entry delete check:
      `planned/globals-in-the-relationships-index.md`.
- [ ] Naming drift between modules, shared helpers copied per module, admin
      casts and copy-pasted staging controls, dead exports and stale doc paths:
      `planned/naming-and-structure-consistency.md`.
- [ ] The five copies of the layout-type list, the private-field leak through
      nested layout fields, `private` on a layout field doing nothing, and
      `searchable`/`translatable` ignored inside groups:
      `planned/named-layout-fields.md`.
- [ ] No consumer for a `col.reference` resolver, and the one-at-a-time lookups
      in `media/methods/used-by.ts`: `planned/col-reference-resolution.md`.
- [ ] Plugin raw routes kept as closures, and the stale `virtual:` reasoning:
      `planned/plugin-route-entrypoints.md`.
- [ ] Invalid `.d.ts` from codegen, and field sorting that answers 400:
      `backlog.md`, under Fields.

## Defects with no other home

- [ ] **Scheduled publish times shift by the timezone offset on every save.**
      `entry-edit-page.tsx` and `global-edit-page.tsx` fill the
      `datetime-local` input with `new Date(x).toISOString().slice(0, 16)`
      (UTC), and `hooks/use-entry-form.ts` reads it back with `new Date(…)`
      (local time). `utilities/formatters.ts` has a correct
      `formatDatetimeForInput`; export it and use it in both pages.
- [ ] **The AI context has no globals case.** `utilities/ai-context.ts` handles
      every `AiContextKind` except `globals`, which `global-edit-page.tsx`
      emits, so it falls through to a generic label. `apps/docs/ai-context.md`
      still lists `'settings'`.
- [ ] **Sort allow-lists disagree.** Users and media each keep their list twice
      (route and repository), and an unknown sort is dropped silently there but
      refused with `UnknownSortKeyError` for entries. Keep one list per
      repository, exported for the route schema, and refuse unknown keys
      everywhere.
- [ ] **Globals' status transitions run in the browser.** `writeGlobal` in
      `global-edit-page.tsx` sequences publish, unpublish and schedule calls
      itself, so any other client must repeat it. `globals.update` should
      accept `status` and `publishedAt`, as entries do.

## Duplication with no other home

- [ ] Media type buckets are defined four times (`types/query.ts`,
      `routes/media.ts`, `media/schema.ts`, admin `types/media.ts`); export one
      constant through `astromech/shared`.
- [ ] `transport/cli/validate-stored-content.ts` rebuilds each module's field
      parse context by hand ("mirrors …/update.ts"); each module should export a
      `fieldParseContext(...)` that its write path and the CLI both call.
- [ ] The entries list has two search mechanisms, `params.search` (title and
      slug) and `where._search` (title only), and `buildListWhere` in
      `entries-table.ts` re-implements the `where` language that
      `createRepository` already compiles. Remove `_search` and compile the
      column keys through the shared compiler.
- [ ] Route argument helpers (`param`, `flag`, `contentArgs`) are copied across
      `routes/entries.ts`, `routes/globals.ts`, `routes/users.ts` and
      `routes/media.ts`; `listArgs` and `getArgs` parse `full` differently from
      `flag()`. Share them in one `routes/args.ts`.
- [ ] Admin query keys (`hooks/use-query-keys.ts`) repeat every entries and
      globals key under a `['plugin', scope]` prefix, although plugin type and
      global ids are already qualified; drop `cacheScope`.
- [ ] Pass-through forwarders: the versions methods in `entries-table.ts`,
      `create` in `globals-table.ts`, and a new globals repository built on
      every call in `globals/internal/global.ts` (cache it per locale). Creating
      an entry also opens a nested transaction that only joins the outer one.
- [ ] The plugin RPC route looks up a plugin's identity and methods twice
      (`routes/plugins.ts`, then the `pluginServices` proxy); let a missing
      handle answer 404.

## Casts and oversized code with no other home

- [ ] `RouterLink as unknown as …` is re-declared in `entry-edit-page.tsx`,
      `global-edit-page.tsx` and `version-history.tsx`; use the one in
      `rendering/cells/link.ts`.
- [ ] The typed entries facade is cast in six server files
      (`app-context/app-context.ts`, `plugin-runtime.ts`,
      `transport/http/client.ts`, `scoped-services.ts`, `call-method.ts`,
      `services.ts`) because `EntriesMethods` collapses the `EntriesService`
      overloads. Build the facade once and pass it everywhere.
- [ ] `createRepository` (`database/repository/create-repository.ts`) is a
      single closure of about 440 lines mixing the `where` compiler, CRUD,
      upserts, batching and encoding; split the compiler out.
- [ ] `routes/entries.ts` (about 600 lines) mixes query-string parsing, access
      ordering, a contract cache and bespoke routes; most of it goes with the
      service-layer work, and the rest splits into `args.ts` and a shared
      `route-access.ts`.
- [ ] `global-edit-page.tsx`, `user-edit-page.tsx` and `entry-new-page.tsx`
      are about 370 to 410 lines each, with the same shape as the entry edit
      page; split them the same way.

## Naming with no other home

- [ ] `defineService` returns `ServiceDefinition`, which breaks the `code`
      skill's rule that `defineX` returns an `X`. Either rename or record the
      exception (`XService` is taken by the bound interface).
- [ ] The `code` skill's `updateEntries({ type, ids, data })` example does not
      match the methods (`id: string | string[]`, with `wireNames` mapping
      `ids` on the wire). Use `ids` and drop `wireNames`, or fix the skill.
- [ ] Small renames: globals' `gate`/`readGate` → `globalGate`/`globalReadGate`;
      `localised` in `globals/schema.ts` → `globalAddressSchema`;
      `entries/unique.ts` → `entries/internal/unique.ts`; the pre-skill banner
      headers in `routes/users.ts` and `middleware/errors.ts`; users' inner
      `decode` → `toUserRow`.

## Tooling

- [ ] `knip.json` treats `tests/**` as entry points, so an export used only by
      tests passes `check:unused`. Decide whether tests should keep an export
      alive.
- [ ] Stale comments: `parse-fields.ts` says settings has no draft concept,
      `references.ts` mentions "the old subsystem", `visibility.ts` `fieldMap`
      claims to skip layout fields, and the admin mentions "pre-extraction
      behaviour".
