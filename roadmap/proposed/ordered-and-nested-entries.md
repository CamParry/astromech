# Ordered and nested entries

Entries have no parent and no position, so a site cannot build `/about/team`
or order its pages by hand. The `tree` field
(`packages/admin/src/components/fields/tree-field.tsx`) nests values inside one
entry, as `@astromech/menus` uses it. Raised on 2026-10-03. **Target: 1.0.**

## Prior art

- **Strapi** #3946, drag-and-drop ordering (148 votes); **Directus**, a tree
  view layout (151); **Payload**, a tree view RFC and native hierarchies planned
  for 4.0, with the `nested-docs` plugin until then; **Sanity**, sequence
  documents (58).
- **Craft structures**, **Statamic**, **Kirby** and **Umbraco** all have page
  trees. The WordPress plugin Post Types Order has 600k+ installs.

## Proposal

- An entry-type capability that adds a parent and a position, shown as a
  draggable tree in the list.
- An option for position alone (manual order without nesting).
- The `url` template can use the parent's path.

## Decided (2026-10-03)

- **`parentId` lives on `entries`**, shared by every locale, as Craft
  structures and WordPress `post_parent` do. A draft copies a content row, not
  the entry, so moving an entry under a new parent applies at once.

## Open questions

- How does it overlap with `roadmap/proposed/media-folders.md`? A folder and a
  parent are two ways of grouping entries.
- What happens to children when a parent is trashed, and to URLs and redirects
  when one moves?
