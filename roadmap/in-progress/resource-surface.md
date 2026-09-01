# Resource Surface

This file holds the storage model that entries, globals and media share, the
column template every table in it follows, and the work to move each resource
onto it, in order. It does not hold the user-facing docs for any of it (those
land in `apps/docs/` as each stage ships), and it does not design per-resource
permissions, which it only makes possible.

## The model

Every resource is three tables. The resource's own table (`entries`, `globals`,
`media`, `users`) holds what is unique per item and shared across locales. Its
**content** table (`entry_content`, `global_content`, `media_content`,
`user_content`) holds one row per locale of what editors author, including the
content-level identifiers (title, slug). Its **versions** table
(`entry_versions`, `global_versions`, `media_versions`, `user_versions`)
snapshots content rows.

An item has one id, its own table's id, and that id is used everywhere public:
URLs, the HTTP API, service methods, relations, preview. Locale is a parameter,
so switching locale is changing the parameter, never looking up another id. A
content row has an internal surrogate id that is never public. It exists because
versions and `stagedFor` need a row to point at, and because a staged change is
a second content row for the same item and locale.

Translation, versioning and staging are one implementation over one shape,
`{ table, contentTable, versionsTable }`. Each resource declares which of those
capabilities it supports, and the shared machinery never touches a resource's
own columns; the resource module owns those.

|              | entries | globals | media  | users (deferred) |
| ------------ | ------- | ------- | ------ | ---------------- |
| translatable | opt-in  | opt-in  | opt-in | opt-in           |
| versioning   | on      | on      | on     | on               |
| statuses     | on      | on      | off    | off              |
| staging      | on      | on      | off    | off              |
| slug         | on      | off     | off    | off              |
| trash        | on      | off     | off    | off              |

Prior art: Drupal's `node` and `node_field_data` (a base row and a per-language
authored row), Craft's `elements` and `elements_sites`, and Payload's base table
and `_locales` table, which are the same shape. This file takes that shape per
resource rather than through one shared table, so the FK from content to its
owner is real and no discriminator column is needed. The cautionary tales are
Strapi, where media alt text is still not localizable because uploads sit
outside the content machinery, and WPML, where a relation points at one
language's row and every translation has to re-point it.

## Decisions made

- **Per-resource tables, not one shared table.** The operations layer never
  names a table; only the repository does, so per-resource tables are one
  implementation parameterized by table, not N implementations. One shared
  table serving several owners needs a reserved id prefix, suppression at four
  choke points (admin config, API routes, permission vocabulary, relation
  targets), a polymorphic owner column with no FK and an orphan check to cover
  for it, and media rows in the content table. All of that is scaffolding for
  sharing, and none of it exists per resource. Rejected: the single `entries`
  table with `_user`, `_media` and `_global` typed rows; renaming that table to
  `documents` or `elements` (also a word `DECISIONS.md` already refuses).
- **One translation mechanism, sibling content rows, everywhere.** Rejected:
  field-level localization (Payload's `localized: true`) for resources without
  a publishing lifecycle. It rules out staging one locale and rolling back one
  locale, and two mechanisms is drift the admin's locale switcher would have to
  paper over.
- **Every resource has its own row, including those with nothing unique per
  item.** Entries and globals have no identity columns, and their own row is
  still where `type`, trash, creation and every cross-locale FK live. It is
  what lets a relation store the entry's id and resolve to the reader's locale:
  today a relation stores one locale row's id, resolution has no locale
  handling, and `apps/docs/content/relationships.md` never mentions locales. It
  is what gives one id per item. And it means the shared repository has one
  shape and no "no owner row" branch. Rejected: entries and globals as their own
  content rows grouped by an opaque key, which is what `localeGroup` is today.
- **`_content`, not `_locales`.** It names what the table holds, which is the
  question asked most; `entry_versions` as versions of `entry_content` reads
  right where "versions of locales" does not; and it reads right on a
  single-language site. Payload's `_locales` holds only localized fields with
  the rest on the base row, so its name does not transfer; Drupal's
  `_field_data` holds everything authored, which is this shape. The satellite
  convention already exists: plural resource table, singular-prefixed
  satellites, as in `entries` and `entry_versions`.
- **Trash is resource-level, and entries-only.** Trashing an entry trashes every
  locale; removing one translation is a different operation. Today `deletedAt`
  sits on each locale row, which allows trashing one locale and was never
  decided. Media has no trash: WordPress ships with media trash off, Payload and
  Drupal do not trash uploads, a trashed file has no answer to what happens to
  the file, and the dangerous accident (deleting an image a page uses) is
  already refused by media's incoming-reference check. Globals cannot be
  trashed. Users are better-auth's to delete.
- **`type` lives on the entries row and is copied onto content rows.** The
  slug-unique index `(type, locale, slug)` and the list index
  `(type, locale, status)` cannot reach across a join. This is the one accepted
  denormalization. Rejected: enforcing slug uniqueness in application code
  (Craft's answer) to keep the column single-homed.
- **Preview tokens are two columns on `entries`.** One token per entry,
  cross-locale, with the locale picked by the preview URL: `previewToken` (the
  hash, unique, nullable) and `previewTokenExpiresAt`. Rejected: keeping
  `entry_preview_tokens`, a one-to-one satellite whose own created columns
  nothing reads. If token audit is ever wanted, that is the signal to bring a
  table back.
- **Globals replace settings pages as the fifth resource.** A global is one item
  with content, versions, drafts and per-locale values, which is the
  convergence `settings-version-history.md` describes and the naming it leans
  to. A ULID `id` plus a unique `key` (the config identity), so every FK target
  in the system has the same id shape; "exactly one" is the unique index on
  `key`. The `settings` key-value table keeps only the naked `plugin:*` class
  that file carves out. Per-global permissions (a header any editor may edit; a
  sensitive global only an admin may) are what the globals row is the target
  for, and are designed later.
- **Media splits into file and content.** `media` keeps file identity
  (`filename`, `mimeType`, `size`, `width`, `height`, `metadata`); `title`,
  `alt`, `caption` and `fields` move to `media_content`, one row per locale, so
  alt text is translatable. Relations and the `media` field keep storing
  `media.id`. Media declares no statuses, staging or trash.
- **Users move last, and only on demand.** Nothing asks for translated or
  versioned profiles. `users.fields` stays where it is. When it moves,
  `user_content` and `user_versions` follow the template with nothing to invent.

### Column template

One template, three table kinds. A column exists wherever the capability it
serves is declarable for that resource, and resource-specific columns sit
alongside the template, never instead of it.

**Resource row** (`entries`, `globals`, `media`, `users`)

| column                   | rule                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | ULID via `col.id()`. Exception: `users.id` is UUID, better-auth's choice.                                                                                                          |
| `createdAt`, `updatedAt` | always                                                                                                                                                                             |
| `createdBy`, `updatedBy` | always, `set null` on user delete. Exception: `users`, whose table better-auth owns. `updatedBy` records changes to this row itself: trash, restore, file replacement.             |
| `deletedAt`              | `entries` only                                                                                                                                                                     |
| specific                 | entries `type`, `previewToken`, `previewTokenExpiresAt`; globals `key`; media `filename`, `mimeType`, `size`, `width`, `height`, `metadata`; users better-auth columns plus `role` |

**Content row** (`entry_content`, `global_content`, `media_content`, `user_content`)

| column                                             | rule                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `id`                                               | ULID, internal, never public                                                                       |
| `entryId` / `globalId` / `mediaId` / `userId`      | FK to the resource row, not null, cascade                                                          |
| `locale`                                           | text, not null                                                                                     |
| `fields`                                           | json                                                                                               |
| `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | always. Created is when this locale was added; updated is its last edit.                           |
| `status`, `publishedAt`, `stagedFor`               | `entries` and `globals`. `stagedFor` self-references the content table.                            |
| specific                                           | entries `title`, `slug`, and the `type` copy; media `title`, `alt`, `caption`                      |
| unique                                             | `(<resource>Id, locale)`, partial `where staged_for IS NULL` where staging exists, plain otherwise |

**Versions row** (`entry_versions`, `global_versions`, `media_versions`, `user_versions`)

| column                   | rule                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `id`                     | ULID                                                                                        |
| `contentId`              | FK to the content row, not null, cascade                                                    |
| `version`                | integer, not null; index `(contentId, version)`                                             |
| snapshot                 | `fields` plus that resource's content-specific columns                                      |
| `createdAt`, `createdBy` | only these. A version is immutable, and the absence of `updated*` is the statement of that. |

### Replaced by this version of the file

The previous design put user and media document rows in the `entries` table as
`_user` and `_media` types behind a reserved `_` prefix, added `hidden: true` as
a public entry-type option plus an internal no-API flag, kept every resource's
versions in `entry_versions`, linked documents to owners through a polymorphic
`ownerId` with a CLI orphan check, and made `_global` an internal entry type.
Every one of those is replaced by the per-resource shape above. What survives
unchanged: alt text is per-asset and translated with it; there are no
per-locale files; relations never target content rows.

## The work, in order

Entries first. The foundational change is the entries identity model, and
nothing else can sit on the shared repository until it is parameterized over the
root/content shape. Building globals on the current shape and migrating it
afterwards would be doing the work twice.

- [x] **Entries.** Split `entries` into `entries` and `entry_content`; rename
      `entry_versions.entryId` to `contentId` and `versionNumber` to `version`;
      preview tokens and `deletedAt` onto `entries`; `type` on both rows. The
      entries repository reads `entries` joined to `entry_content` and keeps
      versions on their own repository; parameterizing one repository over
      `{ table, contentTable, versionsTable }` waits for globals. The entry id
      becomes the public id everywhere: routes, HTTP API, service methods,
      codegen, the relationships index (`targetId` is an entry id) and
      preview. Content-row ids are internal and typed so one cannot be passed
      where an entry id is expected. A migration for `apps/demo` and the
      hand-applied one for `apps/demo-cloudflare`, then `db:generate` and the
      drift snapshot. The walkers in `entries/internal/` (`relationships.ts`,
      `clear-author-references.ts`) enumerate content tables. Custom tables are
      unaffected: `tableRepository` keeps its interface and `supports = []`.
      Two things settled differently from the plan: there is no
      relation-resolution-on-read path, so a relationship field still reads back
      as ids and the reader picks the locale on the second `get`; and `update`
      with a locale that has no content row is how a translation is created,
      rather than `duplicate` with a locale override.
- [ ] **Globals.** `globals`, `global_content`, `global_versions`; a globals
      service and admin section (the edit-surface-without-list generalization);
      the site config declares globals, with the config shape settled when the
      stage starts; settings pages migrate onto it and `settings` keeps the
      `plugin:*` class. `ctx.settings` and `SettingsPageForm` keep working
      through the move, or the move is not behaviour-preserving.
- [ ] **Media.** `media_content` and `media_versions`; `title`, `alt`,
      `caption` and `fields` move; `media` gains `updatedBy` and loses its
      out-of-order appended columns; translation opts in through
      `media: { translatable: true }`.
- [ ] **Cleanup that does not wait.** `users.roleSlug` becomes `role`.
- [ ] **Users.** Only when something asks for it.
- [ ] **Docs, per stage.** `TERMINOLOGY.md`: `Resource` gains global and loses
      settings page, a `Content` entry is added, `Version` widens from an entry
      to a content row. `DECISIONS.md`, edited in place per its own rule: the
      entries that name the `entries` table (expression indexes, FTS5 search),
      the repository-naming entry, the settings entry, and `resource` under
      Reserved words; plus one new entry per decision above that earns it.
      `ARCHITECTURE.md`: the entries-and-fields paragraph.
      `apps/docs/content/relationships.md`: a locale section.

## Interactions

- `content-module-symmetry.md` asks whether the repository seam is deliberate.
  This file answers it for the content resources: one shared repository over
  the root/content/versions shape, with `tableRepository` as the only custom
  seam.
- `settings-version-history.md` describes the convergence the globals stage
  performs, leans to the same name, and carves out the naked-key class this
  file keeps on `settings`.
- `relationships-model.md`: the relation target changes from a locale row to
  the entry id. Check that file when the entries stage starts.
- `custom-table-relations.md` is unaffected; a custom table stays outside this
  shape.
- `flatten-user-and-media-operations.md` intersects the media stage.
- `profile-entry-type.md` is untouched; `profile` stays earmarked.
