# Ordered and nested entries

Entries have no parent and no position, so a site cannot build `/about/team`
or order its pages by hand. The `tree` field
(`packages/admin/src/components/fields/tree-field.tsx`) nests values inside one
entry, as `@astromech/menus` uses it. Raised on 2026-10-03; decided 2026-10-04.
**Target: 1.0.**

Builds on `roadmap/planned/drafts.md` and `roadmap/planned/locale-trash.md`.

## What exists

- The `url` template supports `{slug}` and `{field}`; an empty token means the
  entry has no URL. Core cannot look an entry up by path, so the demo site
  matches pages by one slug.
- The redirects plugin sees only the entry that changed
  (`packages/plugins/redirects/src/hooks/slug-change.ts`), so a parent's slug
  change would miss its children's URLs.
- Menus link to entries by id and resolve the URL when read, so they follow a
  move.
- The admin depends on dnd-kit, and the `tree` field has drag reordering,
  indent and outdent.

## Prior art

- **Requests:** Strapi #3946, drag-and-drop ordering (148 votes); Directus, a
  tree view layout (151); Payload, a tree view RFC and native hierarchies
  planned for 4.0, with the `nested-docs` plugin until then; Sanity, sequence
  documents (58). The WordPress plugin Post Types Order has 600k+ installs.
- **Page trees in core:** Craft structures, Statamic, Kirby, Umbraco and
  WordPress (`hierarchical` post types, `post_parent`, `menu_order`).
- **Storage:** Craft's nested sets have corrupted (#7784) and deadlocked
  (#9905). Payload's `orderable` and Sanity's orderable plugin use a fractional
  index.
- **Paths:** Payload's nested-docs plugin and Umbraco (#5237) save every
  descendant one at a time on a move; WordPress and Payload 4 compute paths on
  read.
- **Integrity:** Payload's plugin allowed loops (#16517) and offered a page's
  own descendants as its parent (#17658); Craft checked `maxDepth` against the
  moved entry only (#15310).
- **Trashing a parent:** WordPress leaves children under it; Craft and Statamic
  move them up; Umbraco's recycle bin and Craft's "Delete (with descendants)"
  take the branch.

## Decided (2026-10-04)

- **`parentId` and `position` live on `entries`**, shared by every locale, as
  Craft structures and WordPress `post_parent` do. A draft copies a content
  row, not the entry, so a move applies at once. A parent must be the same
  type. `position` is a fractional index, a sort key that fits between its
  neighbours, so a move writes one row. Rejected: nested sets, and renumbering
  every sibling.
- **Config:** `orderable: true` for manual order, and
  `hierarchical: true | { maxDepth }` for nesting, which implies `orderable`.
  Naming is in `DECISIONS.md`.
- **Each locale's content row stores its `path`:** the ancestors' slugs and
  its own.
    - The `url` template gets a `{path}` token (`url: '/{path}'`).
    - A unique `(type, locale, path)` index replaces the slug index, so siblings
      need unique slugs and pages under different parents can share one, as
      WordPress allows.
    - `where: { path }` finds a page in one indexed lookup, for the site's
      catch-all route and the admin bar.
    - A move or a published slug change rewrites the descendants' paths with one
      prefix-replace statement per locale.
- **An ancestor missing a locale:** the child has no path, and so no URL, in
  that locale until the ancestor is translated, matching the empty-token rule.
  Rejected: the default locale's slug in its place, which mixes languages in
  one URL.
- **Redirects:** a move or published slug change raises one core event listing
  every changed path (entry, locale, old path, new path), descendants included.
  The redirects plugin writes all its rules in one batch.
- **Drafts:** a slug change in a draft rewrites paths only when published.
  Preview builds the draft's path from its slug and the parent's live path.
- **Trashing a parent trashes its branch**, after a confirmation naming how many
  entries that covers. A `trashedWith` column on each descendant records the
  trash action that took it, and restoring the parent restores those. A
  descendant cannot be restored on its own while its parent is in the trash.
  Rejected: leaving children under a trashed parent, which breaks their URLs;
  moving them up, which changes their URLs silently; and matching `deletedAt`
  timestamps instead of a column.
- **Restore and permanent delete:** an entry trashed on its own whose parent is
  gone is restored under its nearest surviving ancestor, or at the top level.
  Permanently deleting a parent deletes the entries trashed with it; its other
  children move to the grandparent.
- **Locale trash:** a parent's locale cannot be moved to the trash while a
  child has that locale live.
- **An unpublished parent:** children keep their own status. The admin warns
  when a published entry sits under an unpublished one.
- **Integrity:** a move that creates a loop is refused, and `maxDepth` is
  checked against the whole branch being moved.
- **Querying:** `where: { parentId }` and `where: { path }`; `position` is the
  default sort of an orderable type. A `move` method takes
  `{ parentId, before | after }`.
- **Admin:** a tree view on the entry list that loads each branch as it is
  expanded; search results show as a flat list. The parent picker leaves out
  the entry's own descendants.
- **Permissions:** a move needs `update` on the moved entry; adding a child
  needs `create`.

## The work

- [ ] `parentId` and `position` on `entries`, `path` and `trashedWith` on
      `entry_content`, the `(type, locale, path)` index, with
      `pnpm run db:generate` and the Cloudflare baseline hand-applied.
- [ ] `orderable` and `hierarchical` in config; the `{path}` token.
- [ ] Path writes on create, publish and move; the prefix rewrite; the
      missing-ancestor rule.
- [ ] The `move` method, loop and depth checks, permissions.
- [ ] `where: { parentId, path }`; `position` as the default sort.
- [ ] Trash, restore and permanent delete for branches; the locale-trash rule.
- [ ] The path-change event; the redirects plugin writes its rules from it.
- [ ] The admin: tree view, parent picker, drag to move, the unpublished-parent
      warning, the trash confirmation.
- [ ] Revise `DECISIONS.md`, "`type` is copied onto `entry_content`", when
      it lands; `TERMINOLOGY.md` and `apps/docs`.

## Testing

Two children of different parents share a slug; a move rewrites every
descendant's path in every locale and raises one event listing them; a child
whose parent lacks a locale has no URL in it; a loop and a branch deeper than
`maxDepth` are refused; trashing a parent hides the branch and restoring it
brings back only the entries trashed with it; a draft slug change leaves live
paths alone until published.
