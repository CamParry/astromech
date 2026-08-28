# Resource Surface

Every resource is an identity part plus a document part, and every capability
(fields, validation, translation, versioning, trash, the list/edit UI) is
implemented once, against the document part. Entries are the resource that is
all document. Users and media gain the full document experience — translated
fields, version history, site-defined fields with no migrations — without
becoming "entries" to anyone outside core.

Prior art this follows: Craft 5's element model (one `elements` identity table
plus `elements_sites` document rows shared by entries, assets, users and
categories, presented to editors as separate sections) and Drupal's
`file` (identity) vs `media` (authored entity) split. The cautionary tale is
Strapi, where media alt text is still not localizable after five years of open
requests because uploads sit outside the content machinery.

## Decisions made

- **User and media document rows live in the shared `entries` table**, as
  internal entry types owned by their identity row. The `users` table keeps
  identity only (better-auth columns); `media` keeps file identity (path,
  mime, size, dimensions, storage key). Forced by the two constraints below:
  one translation mechanism, and that mechanism being sibling rows — a
  better-auth user is one row by definition, so its translatable document must
  live where sibling rows exist. Rejected: per-resource side tables
  (`media_translations`, `user_versions` — N implementations of one thing);
  field-level localization values inside the row (a second translation
  mechanism).
- **One translation mechanism: sibling rows per locale**, unchanged from
  entries today. Rejected: switching everything to field-level localization
  (Payload's model) — it loses per-locale drafts, status and publishing,
  which entries need.
- **Versions stay in `entry_versions`**, which now covers every document:
  entries, globals, user documents, media documents. No polymorphic versions
  table, no per-resource version tables; the FK to `entries` stays real.
  Identity parts never version — passwords, emails and file records are
  structurally outside the versioned document.
- **Versioning defaults on for every document type, opt-out in site config.**
  Matches entries' current default. Deleting a user or media item cascades to
  its document rows _and their versions_ — retained profile snapshots after
  account deletion are a data-protection defect, not a feature.
- **Translation defaults off, opt-in per resource in site config**
  (`users: { translatable: true }`, `media: { translatable: true }`), the
  same shape entry types use. Most sites are single-language and must never
  have to think about locales.
- **The internal types are `_user` and `_media`, and the `_` prefix is
  reserved for core** — config validation rejects site and plugin type ids
  starting with `_`. The underscore-as-internal convention is already
  established in this codebase (the `/_media` route, `_astromech_cron` and
  `_astromech_plugins` tables, reserved field instance keys `_id`/`_title`,
  the `_search` filter key), and Payload uses it for internal version tables
  (`_posts_v`). Rejected: bare reserved names (takes `media` and `user` from
  every site); qualifying with a core namespace (`astromech/media`) — the
  plugin qualification mechanism exists, but these types are private, and the
  underscore says so where a namespace does not. `profile` stays untouched — it is
  earmarked by `profile-entry-type.md` for editorial identity, which is a
  site-facing entry type related to a user, not this storage mechanism.
- **The internal types are invisible outside core.** Not listed in the admin
  entries UI, not routed by the entries HTTP API. The users and media
  services are the only public surface, and each composes identity + document
  behind one call: updating a user is one request carrying auth fields and
  document fields together; same for media. WordPress's REST API is the
  precedent — attachments are posts, but the route is `/wp/v2/media`, not
  `/wp/v2/posts`. A site developer never sees the storage arrangement.
- **`hidden: true` becomes a public entry-type option** (Payload's
  `admin.hidden`) for site and plugin types that want API access without an
  admin presence. The internal types go further (no API routes); that extra
  step is core-only.
- **Ownership and hierarchy are different relations and get different
  columns.** The identity link is an `ownerId` column on the document rows —
  lifecycle-coupled, cascade-deleted, indexed for the one-owner lookup.
  Hierarchy (`parentId`) is reserved for a future hierarchical-entries
  feature (nested categories). Craft keeps `canonicalId`, `ownerId` and
  `parentId` as three columns; WordPress overloads `post_parent` for
  uploaded-to, revision-of and child-of, and that overload is the mistake to
  avoid. `ownerId` is also distinct from `profile-entry-type.md`'s
  `profile.user` relationship field: that link is optional on both sides, so
  it is an ordinary relation, not ownership. `ownerId` is polymorphic — it
  resolves into `users` or `media` depending on the row's type, so it
  carries no FK; the type column disambiguates, the identity delete paths
  own the cascade (documents and versions), and the CLI validate/rebuild
  gains an orphan check reporting document rows whose owner no longer
  resolves, the same way stale relationship rows read as drift today.
- **Alt text is per-asset**, stored on the media document and translated with
  it. Per-usage alt is an ordinary extra field on the entry that displays the
  image. (Sanity documents this exact fork as unresolved; Drupal supports
  both; we pick a default and keep the override expressible.)
- **No per-locale files.** A locale-specific image is a different media item,
  related from the entry's translation. Contentful is the only surveyed
  platform with per-locale binaries; Craft, Drupal, WPML and Polylang all
  share one file across translations.
- **Globals are rows of the internal `_global` type** in the entries table —
  each site-defined global is one document (one sibling set when translated),
  validated against its own field schema from the site config. Full document
  machinery, quantity one per global, surfaced through a globals service and
  admin section rather than the entries API. This is the persistence
  direction `settings-version-history.md` is under pressure toward; settings
  key-values remain for configuration.
- **Capability matrix for the internal types:**

    |              | `_user`      | `_media`     | `_global`    |
    | ------------ | ------------ | ------------ | ------------ |
    | statuses     | off          | off          | on           |
    | versioning   | on (opt-out) | on (opt-out) | on (opt-out) |
    | translatable | opt-in       | opt-in       | opt-in       |
    | slug         | off          | off          | off          |
    | trash        | off          | off          | off          |
    | staging      | off          | off          | on           |

    Saving a profile or alt text is publishing — no draft lifecycle; trash
    belongs to the identity, not the document. Globals get the full editorial
    lifecycle (draft and staged globals are half the motivation for leaving
    settings key-values). Draft media metadata was considered and rejected —
    Craft and Drupal both make media edits immediate; only entries get drafts.

- **Relations never target internal types.** Entry fields referencing users
  and media keep storing identity ids, exactly as the `media` field type and
  the relationships index do today; the document rows are invisible as
  relation targets, and config validation rejects a relation field aimed at a
  `_`-prefixed type. Document rows do join the relationships index as
  sources (a custom media field can reference an entry), which falls out of
  every entries-table row being a source. Deleting a user or media item
  extends the existing incoming-reference protection (`media` already has
  `used-by`).
- **Internal types have no entry permissions.** The owning resource's
  existing vocabulary governs the composed operation — editing a user's
  document fields is `users:update`, media's is `media:update`.
  `entryPermission('_media', …)` throws on the reserved prefix, so `entry:*`
  grants can never reach internal types. Globals get their own vocabulary in
  the same pattern (per-global grants, shaped at the globals stage), not
  `entry:*`.

## The work, in order

- [ ] **`hidden` entry-type option** and the internal (no-API) flag for core
      types. Small, unblocks everything else.
- [ ] **`ownerId`** on entries: column, index, cascade delete (documents and
      versions) wired into the users/media delete paths.
- [ ] **`_global` documents** — first consumer of the document machinery
      with no identity table to coordinate, and it forces the
      edit-surface-without-list generalization the other two need. Includes
      the globals service, admin section, and permission vocabulary.
- [ ] **User documents**: `astromech/user` type, site config defines the
      fields, service composes identity + document in one update call, signup
      creates the document row, versioning on, `translatable` config option.
      Migrate the existing `users.fields` column data into document rows.
- [ ] **Media documents**: same shape; alt/caption/custom fields move to the
      document row; the media admin UI keeps its own grid and upload flow.
- [ ] **Docs**: `TERMINOLOGY.md` (identity part, document part, internal
      entry type), `DECISIONS.md` entries as each stage ships,
      `ARCHITECTURE.md` resource model paragraph.

## Interactions

- `custom-table-naming.md` should land first (this file is written in its
  vocabulary). `custom-table-capabilities.md` is unaffected: plugin custom
  tables still derive trash/statuses/slug from columns and still don't get
  translation — plugin data needing it belongs in the entries table.
- `content-module-symmetry.md` asks which differences between the five
  content modules are design; this file is most of the answer (users and
  media keep services and identity tables, lose their bespoke document
  handling).
- `flatten-user-and-media-operations.md` and `settings-version-history.md`
  intersect with the user-documents and globals stages respectively; check
  both when those stages start.
