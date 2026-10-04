---
milestone: 1.0
---

# Sidebar groups for entry types and globals

Plugins group their admin pages in the sidebar
(`packages/admin/src/components/layout/sidebar.tsx`), but a site's entry types
and globals cannot be grouped. Raised on 2026-10-03; decided 2026-10-04.

## Prior art

- **Strapi:** grouping content types in the navigation is its second most-voted
  request ever (538, shipped); groups are listed in order with their items.
- **Keystatic** and **Directus** set the order explicitly.
- **Payload:** `admin.group` on each collection and global, ordered by where
  items happen to appear; "better ordering of groups" has been open since 2022.

## Decided (2026-10-04)

- **One ordered list in config:**
  `admin.nav: [{ key, label, icon, items: [...] }]`, each group naming its
  entry types, globals and plugin pages in display order. A site can put a
  plugin's entry types in its own group. Rejected: a per-item
  `admin: { group }` (Payload), which cannot order groups and cannot place a
  plugin's items, since a plugin does not know the site's group keys.
- **Items not listed stay in today's sections.** Plugin groups take their place
  in the same list by namespace.
- **Labels** are a plain string or a translation key, as globals allow.
- **Groups collapse**, and each browser remembers which are open.
- **`nav: false` hides an entry type**, as it does for other items.

## The work

- [ ] `admin.nav` in config and its validation (unknown keys, an item listed
      twice).
- [ ] The sidebar and command palette read it; collapse state per browser.
- [ ] `nav: false` on entry types.
- [ ] `apps/docs`.

## Testing

Groups and items appear in the configured order; a plugin entry type listed in
a site group appears there and not in the plugin's section; an unlisted item
stays in its default section; an unknown key or an item listed twice is a
config error.
