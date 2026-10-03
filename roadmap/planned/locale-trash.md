# Trashing one locale

An entry's translation cannot be removed: trashing or deleting an entry takes
every locale (`DECISIONS.md`, "Trash is resource-level"). Raised on 2026-10-03;
decided the same day. **Target: 1.0.**

Builds on `roadmap/planned/drafts.md`, `roadmap/planned/history.md`,
`roadmap/planned/schedules.md` and the relationship locale column in
`roadmap/planned/relationship-index-defects.md`.

## Prior art

- **Locale trash:** WordPress with Polylang or WPML (each translation is its
  own post, so core trash applies) and EmDash (`deleted_at` on the locale's
  row; restore brings it back as a draft with no schedule, refused if the
  locale was filled meanwhile).
- **Hard delete only:** Strapi 5 ("Delete entry ({locale})", history left
  orphaned), Craft ("Delete for site", not restorable, #13645), Directus,
  Statamic.
- **Unpublish only:** Payload (a per-locale delete PR paused as "clearing"),
  Umbraco (a culture created by mistake cannot be removed, #9735), Contentful.
- **Default locale:** Drupal deletes the whole entity; Statamic makes the
  editor choose Delete or Detach; Umbraco unpublishes the node.
- **Relations:** Craft deletes the site's outgoing relations, after leftover
  rows leaked into other sites' queries (#14347).
- **Permission:** a delete permission (Strapi, Craft `deleteEntriesForSite`,
  Drupal `delete content translations`).

## Decided (2026-10-03)

- **"Move {locale} to trash"** sets a `deletedAt` on that locale's content row.
  A permanent delete happens from the trash only. A row counts as trashed when
  it has its own `deletedAt` or its entry is trashed; this replaces the copied
  `trashed` flag. Unpublishing one locale already exists.
- **Entry trash and locale trash stay separate calls.** Trashing the entry
  covers every locale; restoring the entry does not bring back a locale trashed
  on its own before it.
- **Trashing the last remaining locale trashes the entry.**
- **The default locale cannot be trashed while other locales remain**, since
  the others fall back to it; the editor trashes the entry instead.
- **While a locale is trashed:** its draft is hidden; its history is kept;
  its outgoing relationship rows are removed and rebuilt on restore; incoming
  references are untouched (they point at the entry); its schedules are
  cancelled; search drops it; its URL returns 404, with no automatic redirect.
- **Restore brings the locale back unpublished with no schedule**, and is
  refused if the locale was created again meanwhile or its slug was taken.
- **Permanent delete** removes the row, its draft and its history.
- **Moving a locale to the trash needs `delete`**, not `update`.

## The work

- [ ] `deletedAt` on the content rows of entries, with `pnpm run db:generate`
      and the Cloudflare baseline hand-applied; the trashed predicate in the
      slug index and queries.
- [ ] Trash, restore and permanent-delete methods for one locale, with the
      default-locale and last-locale rules.
- [ ] Relationships, schedules and search on trash and restore.
- [ ] The admin: the action in the locale switcher, trashed locales in the
      trash view.
- [ ] Revise `DECISIONS.md`'s copied-flag entry ("`type` is copied onto
      `entry_content`") when it lands.

## Testing

A trashed locale disappears from reads and reverse lookups in that locale while
other locales stay; restoring the entry leaves a separately trashed locale in
the trash; trashing the default locale is refused while another remains;
trashing the last locale trashes the entry; restore is refused when the slug was
taken; `update` permission alone cannot trash a locale.
