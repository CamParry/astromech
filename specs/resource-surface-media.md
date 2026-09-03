# Resource surface: the media stage

This spec holds the concrete shapes and rules for the media stage of
`roadmap/in-progress/resource-surface.md`, and the chunks the work lands in. It
does not restate the model or the column template; the roadmap file owns those.
Delete this file when the media stage ships.

## Settled before the stage started

- **Media splits into file and content.** `media` keeps file identity;
  `title`, `alt`, `caption` and `fields` move to `media_content`, one row per
  locale. `media_versions` snapshots a content row. Media declares no statuses,
  staging or trash. Translation opts in through `media: { translatable: true }`.
- **Versioning is on and not configurable.** The roadmap table says "on"; there
  is no `versioning` key on `MediaConfig`.
- **Relations keep storing `media.id`.** The `media` field, the relationships
  index and `usedBy` are unchanged in what they store.
- **The migration moves data.** Unlike globals, media rows already carry the
  columns that move, so `0003_media_content` copies them into the default
  locale's content row rather than dropping them.

## Decisions this stage makes

- **A media read falls back to the default locale.** `get` and `query` in a
  locale with no content row return the item with the default locale's
  content, and `Media.locale` names the row the content came from. Entries and
  globals do not fall back, because their locales carry a publish state and a
  staged change of their own. A file is one file: a library listing in `fr`
  that hid every untranslated upload would be useless, and there is no status
  for the fallback to misreport. `Media.locales` says which rows exist, so the
  admin can still offer "Add FR". Drupal's file entities fall back the same
  way.
- **A translation starts as a copy.** The first `update` to a locale with no
  row inserts one seeded from the default-locale row (`title`, `alt`,
  `caption`, `fields`) with the patch applied over it. The read does not change
  shape when the row is created, which is what the fallback promised. Entries
  start a translation empty because an entry's title and slug are per-locale by
  definition; alt text is the same text until someone translates it.
- **`Media.updatedAt` is the resource row's, not the content row's.** It is the
  cache-buster the admin appends to every image URL, so it has to move when the
  file is replaced, and a content edit does not change the bytes. `replace`
  writes `updatedBy` on the resource row for the same reason. Globals expose
  the content row's `updatedAt` because a global has no file. `MediaVersion`
  and the content row keep their own timestamps.
- **Uniqueness scans one locale.** A `unique` field rule on media compares
  against the same locale's content rows, as entries scope to type and locale.
- **The media half of `flatten-user-and-media-operations.md` ships here.** The
  shared content repository resolves its handle from the transaction scope, so
  the `db` parameter on `createMediaRepository` goes and each write runs inside
  one `transaction()` with its relationship-index write. The users half stays
  in that file.

## Shapes

### Tables

`media` (resource row): `id`, `filename`, `mimeType`, `size`, `width`, `height`,
`metadata`, `createdAt`, `updatedAt`, `createdBy` (`set null`), `updatedBy`
(`set null`). Loses `alt`, `title`, `caption`, `fields`, and the appended-column
order with them. Indexes `idx_media_mime` and `idx_media_created` stay.

`media_content`: `id` (ULID, internal), `mediaId` (FK `media`, cascade),
`locale`, `title`, `alt`, `caption`, `fields`, `createdAt`, `updatedAt`,
`createdBy`, `updatedBy`. No `status`, `publishedAt` or `stagedFor`. Indexes:
`(mediaId)`, unique `(mediaId, locale)` (plain, no partial clause).

`media_versions`: `id`, `contentId` (FK `media_content`, cascade), `version`,
`title`, `alt`, `caption`, `fields`, `createdAt`, `createdBy`. Index
`(contentId, version)`.

The tables live in `media/tables.ts`, are re-exported from
`database/tables.ts`, sit in `CORE_TABLES` after `mediaTable`, and are keyed
`mediaContent` and `mediaVersions` in `database/types.ts`.

### Invariant

Every media row has a content row in the default content locale. `upload`
inserts both in one transaction, nothing deletes one content row, and `delete`
cascades. `query` relies on it: the join is on the default locale.

### Ids

`Media.id` is `media.id`, unchanged, and stays the id in every relation, URL,
storage key and service call. Content-row ids are `ContentRowId`, never public.

### Config

```ts
type MediaConfig = {
    fields?: Field[];
    /** Default false. Every locale in `locales` may hold its own content row. */
    translatable?: boolean;
    access?: MediaAccess;
    image?: ImageConfig;
    validate?: ResourceValidator;
};
```

`ResolvedMediaConfig` gains `translatable: boolean`. `AdminConfig` gains
`media: { translatable: boolean }` beside `mediaRoute`.

### `Media` and `MediaVersion`

```ts
type Media = {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
    width?: number | null;
    height?: number | null;
    metadata?: MediaMetadata | null;
    /** The locale the content came from, which is the default when the requested one has no row. */
    locale: string;
    /** Locales that have a content row, this one included. Sorted. */
    locales: string[];
    title: string | null;
    alt: string | null;
    caption: string | null;
    fields: JsonObject;
    createdAt: Date; // media.createdAt
    updatedAt: Date; // media.updatedAt: the file's last change
    createdBy: string | null; // media.createdBy
    updatedBy: string | null; // media.updatedBy: who last replaced the file
};

type MediaVersion = {
    id: string;
    mediaId: string;
    locale: string;
    version: number;
    title: string | null;
    alt: string | null;
    caption: string | null;
    fields: JsonObject | null;
    createdAt: Date;
    createdBy: string | null;
};
```

`Media.fields` is `JsonObject`, no longer nullable; the content repository
defaults it to `{}`.

### `MediaService`

```ts
type MediaService = {
    query(params?: MediaQueryParams & { locale?: string }): Promise<QueryResult<Media>>;
    get(params: { id: string; locale?: string }): Promise<Media | null>;
    upload(params: { file: File }): Promise<Media>;
    replace(params: { id: string; file: File }): Promise<Media>;
    update(params: { id: string; locale?: string; data: MediaUpdateData }): Promise<Media>;
    delete(params: { id: string }): Promise<void>;
    usedBy(params: { id: string }): Promise<MediaUsage[]>;
    versions(params: { id: string; locale?: string }): Promise<MediaVersion[]>;
    restoreVersion(params: { id: string; locale?: string; versionId: string }): Promise<Media>;
};

type MediaUpdateData = Partial<{
    title: string | null;
    alt: string | null;
    caption: string | null;
    fields: JsonObject;
}>;
```

- A missing `locale` is the default content locale. When `translatable` is
  false, any other locale is rejected with `MediaValidationError` (a
  `ValidationError` subclass in `media/errors.ts`, mirroring
  `GlobalValidationError`).
- `get` and `query` fall back as decided above. `versions` and
  `restoreVersion` do not: they address a content row, and a locale with none
  throws `MediaNotFoundError` (404 on the wire).
- `update` on a locale with no row seeds it from the default-locale row and
  applies the patch. `fields` is a patch as today (omitted keeps, `null`
  stores null, containers replace whole). Shared (`translatable: false`) fields
  the write touched propagate to the item's other locales through
  `propagateSharedFields`.
- `update` snapshots the current content row as a version, inside the same
  transaction, when `changesVersionedContent(current, next, ['title', 'alt',
  'caption'])` is true. `restoreVersion` snapshots the row being overwritten
  first and rejects a version whose `contentId` belongs to another row with
  `MediaNotFoundError`.
- `upload` creates the resource row and the default-locale content row in one
  transaction. `replace` updates the resource row only (`updatedBy` included)
  and touches no content row and no version.
- Every write runs its row write and its `indexMediaRelationships` call in one
  `transaction()`. `createMediaRepository` takes no `db` parameter.

### Repository

`media/repository.ts` composes `createContentRepository` over
`{ table: mediaTable, contentTable: mediaContentTable, versionsTable:
mediaVersionsTable, ownerColumn: 'mediaId' }` with a `decode` that builds
`MediaRow` (a `ContentRow` plus the file columns and the three text columns).
It keeps `list` and `count` as hand-built queries on `query.joined()` with the
locale pinned to the default, the existing filename search, mime bucket and
sort allow-list (all resource-row columns), and adds `overlayLocale(rows,
locale)`: one `findMany` on `media_content` for the page's ids in the requested
locale, replacing each row's content where a row exists. `get(id, locale)` is
`content.get({ id, locale }) ?? content.get({ id })`.

### Relationships and the CLI

- `indexMediaRelationships(id)` re-reads every content row of the item and
  writes the union of their edges, as `indexEntryRelationships` does; two
  locales holding the same reference are one index row.
- `collectMediaRelationshipSources` enumerates `media_content`.
- `validate-stored-content`'s `checkMedia` walks content rows and scopes
  `unique` lookups by locale.

### Transport

- `MEDIA_ROUTE_SPECS`: `media.query`, `media.get` and `media.update` gain
  `queryArgs: ['locale']`; `GET /:id/versions` (`media.versions`,
  `queryArgs: ['locale']`) and `POST /:id/versions/:versionId/restore`
  (`media.restoreVersion`, `queryArgs: ['locale']`) are added in table form,
  mirroring the entries versions routes.
- Contract: `versions` (`media:read`, `mutates: false`) and `restoreVersion`
  (`media:update`, `mutates: true`). The client SDK, CLI, MCP and OpenAPI
  follow from the manifest; goldens and parity tests are updated.
- Permissions are unchanged: `media:read|upload|update|delete`.

### Admin

- The detail modal gains a compact locale `Select` in its edit column when
  `admin.media.translatable` is true and more than one locale is configured.
  It is modal-local state, not a route param, because the modal is addressed by
  `?item=` alone. Choosing a locale refetches the item in it; a locale with no
  row shows the fallback content, labelled "Add FR" in the option list, and the
  form's next save creates the row.
- A versions panel beneath the form lists that locale's versions newest first
  with a restore action, through `useMediaVersions` and `useRestoreMediaVersion`.
  It reuses the version list and diff pieces of `VersionHistory` where they
  come apart cleanly; if they do not, a small list in `media/media-versions-
  panel.tsx` is acceptable.
- Query keys gain the locale: `queryKeys.media.detail(id, locale)`,
  `queryKeys.media.versions(id, locale)`.

### Migration

`apps/demo/migrations/0003_media_content.ts`: create `media_content` and
`media_versions`; rebuild `media` without the moved columns and with
`updated_by` in template order (create `media_new`, copy, drop, rename,
recreate the two indexes); insert one `media_content` row per media row in the
demo's default content locale (`en`) carrying `title`, `alt`, `caption`,
`fields`, `created_at`, `updated_at`, `created_by`. Then `pnpm run db:generate`
for the snapshot, and the drift test. `apps/demo-cloudflare/migrations/
0000_migration.ts` and its snapshot are hand-edited to the new baseline.

## Chunks

Each chunk is one commit, verified with `verify:fast` (with
`NODE_ENV=development` for the admin `.tsx` tests) before the next starts.
Boot checks run once after chunk 3 and once after chunk 4.

1. **Storage swap, behaviour preserved.** Tables, `database/` registration,
   both migrations and snapshots, drift test; `media/repository.ts` over the
   content repository; `Media` type gains `locale`, `locales`, `updatedBy`;
   `to-media.ts` and the operations adapted so every existing test passes with
   the default locale only. No new service behaviour.
2. **Service semantics.** `locale` on `query`, `get`, `update`; fallback read;
   translation as copy; shared-field propagation; versions and restore;
   transactions; `MediaConfig.translatable`; contract, `MediaService` type,
   errors, and tests under `tests/services/media/` (a `translatable.test.ts`
   and a `versions.test.ts`, plus atomicity tests as the flatten roadmap asks).
3. **Transport, relationships, CLI.** Route specs, goldens, parity tests;
   the two relationship functions over content rows; `checkMedia`.
4. **Admin.** `AdminConfig.media`, the locale select, the versions panel,
   hooks, query keys, tests.
5. **Docs and roadmap.** `TERMINOLOGY.md` (Media entry names the split),
   `DECISIONS.md` (the fallback read, the translation copy, `updatedAt`),
   `ARCHITECTURE.md` (media module paragraph), `apps/docs` media page gains
   translation and versions sections, roadmap: tick Media, tick the media
   lines of `flatten-user-and-media-operations.md`, delete this spec.
