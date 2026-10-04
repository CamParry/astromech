# Admin widgets

The dashboard is fixed, and the edit screens take only plugin sections. Plugins
add whole pages (the SEO overview is one) and fill the toolbar, right drawer and
global overlay slots (`packages/admin/src/components/plugins/plugin-slot.tsx`),
but cannot add to the dashboard or beside an entry. Raised on 2026-10-03 as
dashboard widgets; decided 2026-10-04 as widgets for any admin area. **Target:
1.0.**

## Prior art

- **Payload:** customisable dashboards were its top-voted RFC (121), shipped in
  3.69 with sizes from `x-small` to `full` and a `defaultLayout`; custom
  components fill many edit-view positions.
- **Strapi:** homepage customisation (357 votes) shipped as widgets with
  `permissions`; injection zones add components to the edit view.
- **WordPress** has dashboard widgets and meta boxes on edit screens;
  **Statamic** widgets take a width and options (`collection`, `limit`);
  **Craft** widgets have a `colspan` and are arranged per user; **Directus
  Insights** builds panels from data.

## Decided (2026-10-04)

- **A widget is a React component for any admin area**, not only the
  dashboard: `defineWidget({ key, label, component, size?, permission? })`.
  Plugins declare theirs under `admin.widgets`; the site places them. Rejected:
  a dashboard-only widget beside a separate edit-screen concept, which gives
  plugins two ways to add a panel.
- **Areas for 1.0:** the dashboard, the edit-screen sidebar of entries,
  globals, media and users, and the header of entry lists. Each area passes its
  context (the entry or global being edited, the list's type).
- **Placing:** the site lists widgets in order per area, with factory helpers
  as `seo.section()` does: `admin.dashboard: [recentEntries(),
backups.widget('last-run')]`, and `admin: { widgets: [seo.widget('score')] }` on
  an entry type. Without a list, core widgets come first, then plugin widgets
  in plugin order.
- **Components only.** Core widgets take options
  (`entriesWidget({ type, sort, limit })`), as Statamic's do. Rejected:
  data-declared widgets (Directus Insights), which no other CMS checked has.
- **Sizes:** `small | medium | large | full` on a 12-column grid that becomes
  one column on phones; sidebars stack widgets at full width. Arranging per
  user is after 1.0, as a user preference defaulting to the site's list; a
  stable `key` keeps that additive.
- **Permissions:** an optional `permission` hides a widget, as `PluginSlot`
  does; core widgets use the read permission of what they show. The server
  still checks every query.
- **Core widgets for 1.0:** recent entries and entry counts (both exist),
  upcoming schedules (`roadmap/planned/schedules.md`), drafts with unpublished
  changes (`roadmap/planned/drafts.md`), and Site health counts
  (`roadmap/planned/site-health.md`). Later, from plugins: awaiting review,
  backups, activity.
- **Shell slots stay** for chrome (toolbar, right drawer, global overlay): they
  have no size and no site-set order. Widgets reuse the slot's lazy loading
  and permission filter. Naming: "dashboard" and "widget", as WordPress, Craft,
  Statamic, Payload and Strapi use them.

## The work

- [ ] `defineWidget`, plugin `admin.widgets`, the client manifest entries.
- [ ] The areas and their context; placing per area in config; the default
      order.
- [ ] The dashboard grid and the edit-screen and list-header areas.
- [ ] The core widgets, each behind its read permission.
- [ ] Decide whether plugin edit-screen sections become widgets in the
      sidebar area, and record it in `DECISIONS.md`.
- [ ] `apps/docs`: placing widgets and writing one in a plugin.

## Testing

Widgets appear in the configured order per area; a widget whose permission the
user lacks is absent; an entry-sidebar widget receives the entry being edited;
the dashboard collapses to one column on a phone; without a list, core widgets
precede plugin ones.
