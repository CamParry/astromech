# One resource module shape

`entries`, `globals`, `media` and `users` share a repository layer
(`content/repository/`) but copy everything above it. This file gives them one
spec and shared method factories, after Strapi's core service factories, so a
fix to one resource is a fix to all four and a missing resource is a type
error. Payload shares its operations across collections but copies the
versions operations for globals; that seam is the one to avoid.

## Why

- Versions methods are copied four times, staging methods twice, locale
  resolvers three times, uniqueness checks four times and not-found and
  validation error pairs four times, several with a comment saying which
  module they mirror. `assertCapability` exists in entries and globals, and
  `overlayLocale`/`buildOrderBy` in users and media.
- The field parse context is built in eight places, four of them in
  `transport/cli/validate-stored-content.ts`.
- Resource kinds are re-listed without `'global'` (`database/tables.ts`,
  `types/services.ts`, `fields/references.ts`,
  `entries/internal/dangling-relations.ts`). So globals are missing from the
  relationships index, `media.usedBy` never reports one (deleting seo's
  default OG image gives no warning), and dead ids in globals are never
  pruned. `globals/internal/stored-fields.ts` says a global needs no pruning,
  which is how the gap arose.
- Entries' reverse lookup keeps only `sourceKind === 'entry'`, so a user or
  media item that references an entry is missing from the delete check.
- Sort allow-lists are kept twice per module, and an unknown key is dropped
  for users and media but refused for entries.
- `auth/setup.ts`, `entries/internal/relationships.ts` and
  `content/relationships.ts` query outside a repository.

## The work

- [x] Relationships: a `'global'` source kind, with every kind enum built from
      `RESOURCE_TYPES`; bind `globals/internal/relationships.ts`; prune
      dangling references on the globals write path; move
      `pruneDanglingRelations` to `content/`. One batched source-title loader
      in `content/`, generalised from `media/methods/used-by.ts`, serves every
      reverse lookup, and entries' lookup reports every source kind. A global's
      key is its `sourceType`. `content/` moved onto the content modules' line
      in the layer model, since the prune and the loader read the entry
      repository registry.
- [x] The reverse lookup is `usedBy` everywhere: entries'
      `incomingRelationships` and media's `listMediaUsage` become one key, one
      `Usage` type and one path, `/:id/used-by`. **Public API.**
- [x] `content/resources.ts`: `ResourceSpec` and `RESOURCE_SPECS`. The spec
      holds the kind, a name for messages, the field tree, the translatable
      and statuses tests, the validator, the sortable and versioned columns. It
      holds no repository factory: `DECISIONS.md` says why.
- [x] One locale resolver, one uniqueness check (`isUniqueAmong`), one
      `assertCapability` (with `CapabilityError` moved to `errors/`), and
      shared `overlayLocale`/`buildOrderBy`, all in `content/`. The resolver is
      `resolveResourceLocale`, since `resolveContentLocale` already names the
      RFC 4647 lookup in `utilities/locale.ts`.
- [x] `ResourceNotFoundError(kind, …)` and `ResourceValidationError`, the
      first extending `ApiError`, the second `ValidationError`, plus one
      `StagedChangeExistsError`. **Public API** (exported classes, the
      `staged_change_exists` code).
- [x] `content/write-fields.ts`: merge or inherit, parse through
      `fieldParseContext(spec, …)`, project, prune. Every create and update
      uses it, and so does the CLI validator, which takes the app context
      instead of calling `getConfig()`.
- [x] Versions and staging: no `createVersionsMethods`/`createStagingMethods`
      factory (`DECISIONS.md`). The shared kernel is `restoreVersion`,
      `snapshotVersion` and `changesVersionedContent` in `content/versions.ts`,
      reading the spec's versioned columns; a missing staged change answers 404.
- [x] `globals.update` accepts `status` and `publishedAt` like entries, so the
      admin stops sequencing publish, unpublish and schedule calls in
      `global-edit-page.tsx`. **Public API** (additive).
- [x] Lists: users and media share one list/count signature and one query
      handler shape (`queryPage`); one sortable list per spec; an unknown sort
      answers 400 everywhere, from the method rather than the route schema, so
      every transport answers alike; one media type-bucket constant exported
      through `astromech/shared`; `where._search` is gone and entry column keys
      compile through the shared `where` compiler, now
      `database/repository/where.ts`.
- [x] Pass-throughs: the versions forwarders in `entries-table.ts` and the
      create/update wrappers in the globals, users and media repositories are
      gone, and users' and media's delete transactions both live in the method.
      Two items stay as they are: the globals repository is still built per
      call, like the users and media ones, because caching it would be a
      module-scope singleton; and entry create's nested transaction joins the
      outer one by design, while `content.create` keeps its own for callers
      with no outer transaction.
- [x] `auth/setup.ts`'s conditional insert moves to `users/repository.ts`. The
      relationships modules read through the table repository
      (`createRepository`), which the `code` skill counts as a repository, so
      no raw query remains there.
- [x] Guard: `tests/content/resource-conformance.test.ts` runs
      `describe.each(RESOURCE_TYPES)` over the not-found code, the
      non-translatable locale refusal, a version round trip, `usedBy` seeing
      the resource, and an unknown sort answering 400. The `code` skill gains a
      rule: a helper a second resource needs moves to `content/`, and a
      "mirrors …" comment is a defect.

Depends on `policy-in-the-service-layer.md` (error codes, `requires` in `bind`,
the `'en'` fix).
