# Sidebar groups for entry types and globals

Plugins group their admin pages in the sidebar
(`packages/admin/src/components/layout/sidebar.tsx`), but a site's entry types
and globals cannot be grouped. Raised on 2026-10-03. **Target: 1.0.**

## Prior art

- **Strapi:** grouping content types in the navigation is its second most-voted
  request ever (538, shipped).
- **Payload:** `admin.group` on collections and globals; "better ordering of
  groups" is an open request.

## Proposal

- An `admin.group` option on entry types and globals, with the group's label
  and order set once in config.
- Plugin groups and site groups share one ordering.

## Open questions

- Can a plugin's entry types join a site's group?
- Is the label a translatable string or a key?
