# Output schemas

Every service method declares an output schema, and `bind()` parses each result
through it on the way out, the same way it parses input on the way in. Handlers
return the internal model, a _resource_ (`UserResource`); callers get the public
shape (`User`). The same schema types the public shape and documents the
response in OpenAPI. This file covers the internal model's rename, one
`updatedAt` per resource, and versions read in the public shape.

## Why

Checked against the code on 2026-09-25.

- **"Row" names two different things.** `UserTableRow` and `UserContentRow` are
  table rows. `UserRow`, `MediaRow`, `EntryRow` and `GlobalRow` (base
  `ContentRow`) are the reshaped result of a join, not a row of any table. The
  decoder's first argument, the resource table's row, is called `own`, while the
  comments call it the "resource row" and the content repository calls it
  `owners` and `ownerColumn`.
- **"Account" means two tables in `users/`.** `findAccount`, `findAccounts`,
  `updateAccount`, `accountUpdatedAt` and `UserAccountPatch` mean the `users`
  row. `createCredentialAccount` and `accountsTable` mean better-auth's
  `accounts` table.
- **Each public type is mapped by hand.** `toEntry`, `toGlobal`, `toMedia` and
  `toUser` copy fields one by one so internal ones (`contentId`) never leave. `types/domain.ts` declares each public type separately, so nothing
  checks that a mapper and its type agree.
- **The OpenAPI spec has no response bodies.** `documentRoute()` in
  `packages/astromech/src/transport/http/routes/rest-route.ts` registers a status
  and a description only. `ServiceMethod` already has an optional `output`
  (`packages/astromech/src/types/methods.ts`), and the method manifest already
  converts it to JSON Schema, but no method in core or in a plugin sets it.
- **`updatedAt` means four different things.** `Entry.updatedAt` and
  `Global.updatedAt` are this locale's last content edit. `Media.updatedAt` is
  the file's last replacement. `User.updatedAt` is the last change to `name`,
  `email` or `role`. Sorting follows the same split: entries sort by the content
  column, users by the resource column. A resource row's `updatedAt` only moves
  when something calls `update` on that table directly. Globals never do, and a
  fields-only user edit, a media metadata edit and every entry content, status,
  merge and restore write leave it alone.
- **`findAccountRow` fakes a content row.** When a user has no content row in
  the requested or the fallback locale, it builds a `UserRow` with
  `contentId: ''` and `locales: []`. Any caller that later passed that
  `contentId` to the versions repository would fail silently. Every write path
  already creates a default-locale content row, and the users list (which
  filters on the default locale) doesn't show a user without one, while
  `users.get` does.

## Decisions

- **A resource is the internal model; the public type keeps the plain name.**
  `UserResource`, `MediaResource`, `EntryResource` and `GlobalResource` (base
  `Resource`) join the resource row with one locale's content row, plus the
  list of locales that have one. Version rows are not part of it. The
  repository decoder is `toUserResource`. `User`, `Media`, `Entry` and `Global`
  stay the public names, because they are what plugin and site code import.
  `TERMINOLOGY.md` already defines a resource as one entry, global, media item
  or user. Rejected names: `UserRow` (a join result isn't a table row),
  `StoredUser` (what is stored is the separate rows), `UserEntity` (TypeORM and
  DDD disagree on what an entity is, and it reads close to "entry"),
  `UserInstance` (says nothing), `UserInternal` (says where it's used, not
  what it is), `UserOutput` and `PublicUser` for the public side (they would
  push a suffix onto every plugin signature).
- **The resource carries the public field names.** An output schema only strips
  fields; it never renames or computes one. Transforms are out for two reasons:
  `@hono/zod-openapi` documents the input side of a transform or a pipe (tested
  on 1.6.0, it published `contentId` and `accountUpdatedAt` as the response
  shape), and a stripping schema keeps parsing, types and docs on one object.
  So `toMediaResource` resolves `url` itself, since the `media/` module may
  already import `storage/`.
- **Output is parsed at `bind()`, not at the HTTP layer.** Service methods are
  public too: plugins call `ctx.users.get` and site code calls the services
  directly. Parsing at `bind()` gives HTTP, plugins and site code the same
  public shape, and keeps the content-row id private as `TERMINOLOGY.md`
  requires. Every core method declares `output`. A plugin method may leave it
  out, and its result then passes through unparsed.
- **The public type is inferred from the schema.** `export type User =
z.output<typeof userSchema>`, with the schema in the resource's `schema.ts`.
  The hand-written types in `types/domain.ts` go.
- **Bad output fails in three tiers.**
    - _Unparsed:_ `fields`. Field definitions can change after data is stored,
      and walking the JSON tree on every read costs the most. The schema types
      it without checking it.
    - _Recoverable:_ nullable and optional values (`image`, `publishedAt`,
      `width`). `.catch(fallback)` substitutes the default, and the call logs
      one warning naming the method, the resource id and each key path that
      fell back. The page still loads, and the drift is visible.
    - _Required:_ `id`, `email`, `role`, `createdAt` and the like. The call
      fails.
- **A failed output parse gives a readable error.** `bind()` catches the
  `ZodError` and throws a core error naming the method, the resource id and
  locale, and each issue with its path (`z.prettifyError`), for example: "users.get
  returned a user that doesn't match its output schema (id 8f2c…, locale en):
  role: expected string, received null". Over HTTP it answers 500 with a
  generic body; the detail goes to the log only, since it names internal data.
- **One `updatedAt` per resource: the resource row's.** Every write that changes
  a resource stamps its resource row. The resource row's `updatedAt` is then the
  latest change to anything about the resource, in any locale. The content
  row keeps its own `updatedAt` column for this locale's edits, but it isn't
  public. `accountUpdatedAt` and `fileUpdatedAt` go. There is no "later of two
  columns": if a write doesn't touch the resource row, that write is the bug.
- **Zod's compiled parsing needs no setup.** Zod 4 compiles object parsers by
  default and falls back to interpreting them where `new Function` is blocked,
  as on Workers.

## Settled while building

- **Staging writes don't stamp the resource row.** A staged change isn't the
  resource yet: staging create and update leave it alone, merge stamps it. A
  staged read reports its own staged row's `updatedAt` and `updatedBy`, as
  Payload, Craft, Strapi, Sanity and WordPress do (`DECISIONS.md`).
- **The staging divergence check moved to the server.** A staged read carries
  `diverged`, computed from the canonical content row's `updatedAt` and the
  staged row's `createdAt`. The admin's merge dialog reads that flag.
- **Per-locale consumers of `updatedAt`.** The SEO sitemap's `lastmod` now moves
  when any locale is edited, which is acceptable. The admin versions media URLs
  by the file's content hash (`metadata.version`), falling back to `updatedAt`,
  so a metadata edit no longer busts the cache.
- **`staged` stays public** on `Entry` and `Global`; the old mappers already
  copied it.

## The work

- [x] **1. Rules.** `TERMINOLOGY.md`: extend "Resource" to name the internal
      model and `toXResource`, and "Schema" to cover output schemas.
      `DECISIONS.md`: output parsed at `bind()`, strip-only output schemas, the
      three tiers, one `updatedAt`. The `code` and `api` skills get the rules.
- [x] **2. The resource model.** For all four resources: `XRow` becomes
      `XResource` and `ContentRow` becomes `Resource`; `toXRow` becomes
      `toXResource`; the decoder's `own` becomes `resource`, and the content
      repository's `owners` and `ownerColumn` follow. `toMediaResource` resolves
      `url`. In `users/`, "account" is kept for better-auth's `accounts` table
      only: `findAccount`, `findAccounts` and `updateAccount` become
      `findResourceRow`, `findResourceRows` and `updateResourceRow` (or
      another plain name), and `UserAccountPatch` follows.
- [x] **3. Remove `findAccountRow`.** `userRepository.findOne` with a fallback
      reads the requested locale, then the fallback locale, then
      `findAnyLocale`, then answers null. Callers: `auth/session.ts`,
      `users/methods/get.ts`, `users/methods/update.ts`.
- [x] **4. One `updatedAt`.** The content repository's canonical writes stamp the
      resource row in the same transaction. That covers content updates,
      status batches, merge, version restore, field propagation and the
      duplicate path. Media and user resources carry the resource row's
      `updatedAt` only. Entries sort `updatedAt` by the resource column.
      Settle the open questions above.
- [x] **5. Output schemas.** An output schema in each resource's `schema.ts`, the
      public types inferred from them, and `output` on every core method
      (single reads, `QueryResult` lists, versions, notifications). `bind()` in
      `services/define-service.ts` parses the result with the three tiers and
      the error format above. The `to*` mappers and the hand-written types in
      `types/domain.ts` go.
- [x] **6. OpenAPI.** `documentRoute()` registers each method's output schema as
      the response body, taken from the schema object directly.
- [ ] **7. Plugins.** Redirects and forms declare outputs on their methods; the
      plugin docs describe `output`.
- [ ] **8. Versions in the public shape.** `versions.get({ id, locale, version })`,
      addressed by resource id and version number, returns the version's
      metadata (`version`, `createdAt`, `createdBy`) and a `snapshot`. The
      snapshot is the public type narrowed to the versioned keys (for entries,
      `title`, `slug`, `fields` and `status`), because resource-row columns are
      never versioned and a full `Entry` would mix two points in time. `versions.list` returns
      the metadata only. The four hand-written version types become one shape
      per resource, derived from its output schema. Payload nests the document
      under `version` in the same way; check its source before building. Fix
      the doc comment on `UserVersion`, which says "media item".

## Later

- **Share the resource output keys.** `entrySchema`, `globalSchema` and
  `mediaSchema` repeat the same timestamp and audit keys (`createdAt` to
  `updatedBy`), and the entry and global version schemas repeat each other.
  Fold them into shared pieces with step 8, when the version shapes change.
- **Share the media and users repository code.** `media/repository.ts` and
  `users/repository.ts` repeat four blocks: the list filter, `findByLocale`, the
  chunked id lookup and the update and delete members. The copies predate this
  work; they carried over from the rename in step 2.
- **Document the other error statuses.** Routes document their success body
  and, where a row has `notFound`, a 404 with the shared `Error` component.
  401, 403, 422 and 500 are not documented yet.
- **Document `/me`.** It is served in `transport/http/app.ts`, outside the
  route tables, so it has no response schema.
- **Entry methods in the method manifest emit no `output`.**
  `projectEntryMethod` in `codegen/method-manifest.ts` projects the input only.
- **Plugin routes are not in the OpenAPI document.** `/api/plugins/*` is a plain
  Hono router; declaring `output` on a plugin method types and parses its
  result but does not document it over HTTP.
