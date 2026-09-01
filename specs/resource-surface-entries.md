# Resource surface: the entries stage

This spec holds the concrete shapes and rules for the entries stage of
`roadmap/in-progress/resource-surface.md`, and the chunks the work lands in. It
does not restate the model or the column template; the roadmap file owns those.
Delete this file when the entries stage ships.

## Shapes

### Tables

`entries` (resource row): `id`, `type`, `previewToken` (text, unique, nullable),
`previewTokenExpiresAt` (nullable), `deletedAt`, `createdAt`, `updatedAt`,
`createdBy`, `updatedBy`. Indexes: `(type)`, `(deletedAt)`.

`entry_content`: `id` (ULID, internal), `entryId` (FK `entries`, cascade),
`type` (copy of `entries.type`), `locale`, `title`, `slug`, `fields`, `status`,
`publishedAt`, `stagedFor` (self FK, `no action`), `createdAt`, `updatedAt`,
`createdBy`, `updatedBy`. Indexes: `(entryId)`, `(type, locale, status)`,
`(stagedFor)`, unique partial `(entryId, locale) WHERE staged_for IS NULL`,
unique partial `(type, locale, slug) WHERE staged_for IS NULL`.

`entry_versions`: `id`, `contentId` (FK `entry_content`, cascade), `version`,
`title`, `slug`, `fields`, `status`, `createdAt`, `createdBy`. Index
`(contentId, version)`.

`entry_preview_tokens` is dropped. `localeGroup` is dropped.

### Ids

- `Entry.id` is `entries.id`. It is the only entry id that appears in a URL, a
  service call, a relation, a version list, a preview URL or the admin.
- A content-row id is `ContentRowId`, a branded string
  (`string & { readonly __brand: 'ContentRowId' }`), declared in
  `entries/repository/types.ts`. It never crosses the service boundary: no
  method takes or returns one, and `Entry` does not carry one.
- `stagedFor` on a content row points at the canonical content row's id. The
  public `Entry.stagedFor` becomes `staged: boolean`.

### `Entry`

```ts
type Entry = {
    id: string;
    type: string;
    locale: string;
    /** Locales that have a content row, this one included. Sorted. */
    locales: string[];
    slug: string | null;
    title: string;
    fields: JsonObject;
    status: EntryStatus;
    /** True when this read is the staged change rather than the canonical row. */
    staged: boolean;
    publishedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date; // entries.createdAt: when the entry was created
    updatedAt: Date; // entry_content.updatedAt: this locale's last edit
    createdBy?: string | null; // entry_content.createdBy
    updatedBy?: string | null; // entry_content.updatedBy
};

type EntryVersion = {
    id: string;
    entryId: string;
    locale: string;
    version: number;
    title: string;
    slug: string | null;
    fields: JsonObject | null;
    status: EntryStatus | null;
    createdAt: Date;
    createdBy: string | null;
};
```

`localeGroup` and `locales: Record<locale, id>` are gone. `populateLocales`
becomes a grouped `SELECT entryId, locale FROM entry_content` over the page.

### Locale as a parameter

Every by-id method on `EntriesService` takes `locale?: string`. Missing means
the default content locale (`getDefaultContentLocale()`), as `create` and
`query` already do. The rules:

- `get`, `update`, `publish`, `unpublish`, `schedule`, `versions`,
  `restoreVersion`, `createStaged`, `getStaged`, `mergeStaged`,
  `deleteStaged` act on the content row `(id, locale)`. A missing row is
  `null` from `get` and `EntryNotFoundError` from the rest. `get` does not fall
  back to another locale; only relation resolution does (below).
- `update` on a translatable type whose `(id, locale)` row does not exist
  creates it, inheriting shared fields from the default-locale row through
  `inheritSharedFields`, with `create` validation applied to the merged
  result. This replaces `duplicate({ overrides: { locale, localeGroup } })` as
  the way a translation is made. It follows Payload, where `update` with a
  `locale` writes that locale's data whether or not it existed. A
  non-translatable type rejects any locale other than the default with
  `EntryValidationError`.
- `create` takes `data.locale` as today and creates both rows. `duplicate`
  creates a new entry (new `entries` row) with every locale of the source
  copied, or only `overrides.locale` when given; it can no longer make a
  translation.
- `trash`, `restore`, `delete`, `emptyTrash`, `incomingRelationships`,
  `issuePreviewToken`, `revokePreviewToken` are resource-level: no `locale`
  parameter, and `cascadeLocales` is removed. Trash sets `entries.deletedAt`
  and `entries.updatedBy`.
- `query` keeps `locale` (default, or `'all'`). Non-translatable types keep
  every row on the default locale.

### Relations

`relationships.targetId` for `targetKind: 'entry'` is an entry id. Resolution
of a relation value into an `Entry` picks the reader's locale, then the default
content locale, then nothing. The reverse lookup (`incomingRelationships`) and
`where: { references }` are unchanged in shape; both now compare entry ids. The
index is derived, so the migration rebuilds it rather than rewriting rows:
after the schema move, `entries/internal/relationships.ts` indexes from
`entry_content` and the CLI `index-rebuild` repopulates.

### Preview

One token per entry, held on `entries.previewToken` and
`entries.previewTokenExpiresAt`. Verification is unchanged in shape
(`hashPreviewToken`, `isValid`). A preview read is `get({ id, locale,
previewToken, staged })`; the token authorizes every locale of the entry.

### Versions

A version snapshots a content row, so a version list is per `(id, locale)`.
`restoreVersion` restores into that content row. The version number sequence is
per content row.

### Custom tables

`tableRepository` keeps its interface. Its rows are their own content:
`id` is the public id, `locale` is the default locale, `locales` is
`[defaultLocale]`, `staged` is false. Nothing about the split reaches it.

## Migration

`apps/demo` gets a new migration, generated by `db:generate` and then edited to
move data: create the new tables, copy `entries` into `entries` (one row per
`localeGroup`, taking the oldest row's `id`, `type`, `createdAt`, `createdBy`,
and `deletedAt` if every row in the group is trashed) and `entry_content`
(every row, `entryId` from the group's chosen id), remap `stagedFor`, copy
`entry_versions` with `contentId` = the content row that carries the old
`entryId`, drop `entry_preview_tokens`, then rebuild the relationships index by
mapping each `targetId` that is an old row id to its group's entry id.
`apps/demo-cloudflare` gets the same change hand-applied to
`0000_migration.ts` and its `snapshot.json`, keeping that file's table order.
`apps/demo/seed.ts` stops writing `localeGroup` and creates translations
through `update` with a `locale`.

## Chunks

Each chunk is one commit on `feat/resource-surface`. A chunk's own tests pass
at its commit; the package typechecks from chunk 2 onward; `pnpm run verify`
passes from chunk 5 onward and before merge.

1. **Storage.** `entries/tables.ts`, `database/tables.ts`, `database/types.ts`,
   `entries/repository/*` (`types.ts`, `entries-table.ts`, `versions.ts`,
   `maintenance.ts`, `table.ts`; delete `preview-tokens.ts`), the demo and
   Cloudflare migrations and snapshots, and the repository and `tests/db`
   tests. The repository interface changes as follows: every by-id method
   takes `{ id, locale }` and returns `EntryRow` with `entryId`, `contentId`
   (branded), `locale`, `locales`, `staged`; `versions.*` key on
   `ContentRowId`; `staging.getByCanonical(id, locale)`; `translatable.siblings`
   and `propagateFields` take an entry id; `trash.*` and `delete` take entry
   ids; `previewToken.{set,clear,find}` live on the repository.
2. **Domain and operations.** `types/domain.ts`, `types/services.ts`,
   `types/typed-entries.ts`, `entries/operations/*`, `entries/internal/*`,
   `database/repository/resource-existence.ts`, `relationships.ts`,
   `dangling-relations.ts`, and `tests/services/entries/*`,
   `tests/services/users/author-references.test.ts`,
   `tests/db/relationships-index.test.ts`, `tests/services/media/used-by.test.ts`.
3. **Transport.** HTTP routes and specs, client, CLI, MCP, method manifest,
   OpenAPI, codegen goldens, and `tests/transport/*`, `tests/codegen/*`.
4. **Admin.** `admin/hooks/entries.ts`, `locale-switcher.tsx`,
   `translations-cell.tsx`, `entry-edit-page.tsx`, versions page, and
   `tests/admin/*`. The locale switcher changes the `locale` search param and
   keeps the id.
5. **Plugins, demo, docs.** menus, seo, redirects, forms; `apps/demo/seed.ts`
   and `src/lib/data.ts`; `TERMINOLOGY.md`, `DECISIONS.md`, `ARCHITECTURE.md`,
   `apps/docs/content/relationships.md` per the roadmap's docs bullet; tick the
   entries checkbox; full `verify`, `check:boot`, `check:boot:cloudflare`.

Chunks 3 and 4 touch disjoint files and run in parallel after chunk 2.
