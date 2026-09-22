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

- [ ] Relationships: a `'global'` source kind, with every kind enum built from
      `RESOURCE_TYPES`; bind `globals/internal/relationships.ts`; prune
      dangling references on the globals write path; move
      `pruneDanglingRelations` to `content/`. One batched source-title loader
      in `content/`, generalised from `media/methods/used-by.ts`, serves every
      reverse lookup, and entries' lookup reports every source kind.
- [ ] The reverse lookup is `usedBy` everywhere: entries'
      `incomingRelationships` and media's `listMediaUsage` become one key, one
      `Usage` type and one path, `/:id/used-by`. **Public API.**
- [ ] `content/resources.ts`: `ResourceSpec` and
      `RESOURCE_SPECS: Record<ResourceType, ResourceSpec>` (repository factory,
      translatable test, sortable columns, source kind, field definitions).
- [ ] One `resolveContentLocale(spec, …)`, one uniqueness factory, one
      `assertCapability` (with `CapabilityError` moved to `errors/`), and
      shared `overlayLocale`/`buildOrderBy`, all in `content/`. Delete the
      per-module copies.
- [ ] `ResourceNotFoundError(kind, …)` and `ResourceValidationError`, extending
      `AstromechError` with the status and code from
      `policy-in-the-service-layer.md`. Delete the four module pairs.
      **Public API** (exported classes).
- [ ] `content/write-fields.ts`: merge or inherit, parse through
      `fieldParseContext(spec, …)`, project, prune. Every create and update
      uses it, and so does the CLI validator, which stops calling
      `getConfig()`.
- [ ] `createVersionsMethods(spec)` for all four resources and
      `createStagingMethods(spec)` for entries and globals; delete the
      per-module files.
- [ ] `globals.update` accepts `status` and `publishedAt` like entries, so the
      admin stops sequencing publish, unpublish and schedule calls in
      `global-edit-page.tsx`. **Public API** (additive).
- [ ] Lists: users and media share one list/count signature; one sortable list
      per spec, read by the route schema; an unknown sort answers 400
      everywhere; one media type-bucket constant exported through
      `astromech/shared`; remove `where._search` and compile entry column keys
      through the shared `where` compiler, split out of
      `database/repository/create-repository.ts` for the purpose.
- [ ] Pass-throughs: the versions forwarders in `entries-table.ts`, `create` in
      `globals-table.ts`, the globals repository built on every call (cache it
      per locale), and the nested transaction on entry create. Users' and
      media's delete transactions live in the same layer.
- [ ] The queries in `auth/setup.ts` and the relationships modules move behind
      a repository.
- [ ] Guard: `tests/content/resource-conformance.test.ts` runs
      `describe.each(RESOURCE_TYPES)` over the not-found code, the
      non-translatable locale refusal, a version round trip, `usedBy` seeing
      the resource, and an unknown sort answering 400. The `code` skill gains a
      rule: a helper a second resource needs moves to `content/`, and a
      "mirrors …" comment is a defect.

Depends on `policy-in-the-service-layer.md` (error codes, `requires` in `bind`,
the `'en'` fix).
