---
milestone: 1.0
---

# Admin widgets and edit-screen layout

The dashboard is fixed, and the edit screens hold only fields. Plugins add whole
pages (the SEO overview is one) and fill the toolbar, right drawer and global
overlay slots (`packages/admin/src/components/plugins/plugin-slot.tsx`), but
cannot add a panel to the dashboard or beside an entry. Raised on 2026-10-03 as
dashboard widgets; decided 2026-10-04 as widgets anywhere in the admin, with the
edit-screen layout around them.

Prerequisite: `roadmap/planned/admin-ui-defects.md` (the `Button` type).

## What exists

- An entry type's or global's `fields` is a list or `{ main, sidebar }`
  (`EntryFields` in `packages/astromech/src/types/fields.ts`); where a field is
  listed decides where it shows. Both areas share one value namespace, so
  moving a field never changes stored data. Media and users take a flat list.
- Layout types (`tabs`, `tab`, `accordion`, an unnamed `group`) draw a surface
  and store nothing. `seo-preview` is a field type that stores nothing, marked
  `affectsData: false` (`packages/plugins/seo/src/fields/seo-preview.ts`).
- `seo.section()` returns a named `group` the site places anywhere.
- The edit screens render no `<form>` element: form state is a TanStack Form
  object, Save is in the header, Cmd/Ctrl+S saves, and validation is our own.

## Prior art

- **Placement declared by the item breaks silently.** Payload's
  `admin.position: 'sidebar'` renders in main inside tabs (discussion #8789);
  its SEO plugin's `tabbedUI` removes the sidebar (#18138); Gutenberg dropped
  WordPress's `after_title` meta box context (gutenberg#5821).
- **Placement by listing:** Statamic's `sidebar` section, Kirby's columns of
  sections, and Contentful's per-type `sidebar` list, where built-in panels
  (publication, versions, references) and app panels are peers.
- **Closed sidebars are a standing complaint:** Directus #10950 (54 votes),
  Craft's meta sidebar, Gutenberg's unorderable panels (#56009).
- **Filament 4** builds a schema from components that all extend one base:
  fields, layout components, entries and prime components (static text,
  images), side by side. Earlier versions kept fields in forms and widgets on
  dashboards; version 4 lets each go anywhere.
- **Forms:** Payload, Strapi, Kirby and Craft wrap the edit screen in one
  `<form>`, then portal drawers and slideouts out of it to avoid nesting;
  Strapi's Enter handling deleted a repeatable item (#22833), opened "Fill in
  from another locale" (PR #24744) and leaked a modal's shortcut into the
  parent's save (#27674). Directus, Statamic and Gutenberg render no form.
  The HTML parser drops a nested form start tag.
- **Dashboards:** Payload 3.69 (sizes `x-small` to `full`, `defaultLayout`),
  Strapi's homepage widgets with `permissions`, Statamic widgets with options,
  Craft's per-user `colspan`.

## Decided (2026-10-04)

### The structural model

- **A fields list holds three kinds of item:** fields (a name, a stored
  value), layout (`tabs`, `accordion`, an unnamed `group`: arranges children,
  stores nothing) and widgets (display and act, store nothing). The kind is
  structural, as in Filament 4: a widget is made by `defineWidget`, not by a
  field type with a flag, so `affectsData` goes and `seo-preview` becomes a
  widget. The base is an internal union (`Field | Layout | Widget`) the
  renderer, codegen and walkers switch on. The config key stays `fields`, as
  Payload's arrays hold `ui` items. Rejected: renaming the flag (`readOnly`
  already means a stored value shown but not editable); a public base class,
  which plain config objects do not need; calling it "component", which is the
  React component a widget points at; and "schema" for the list, which
  `schema.ts` (Zod) holds.
- **One `defineWidget({ key, label, component, size?, permission?, context })`**
  for every area. `context` declares what the widget needs (nothing, a
  resource being edited, a list); config validation refuses a widget placed
  where its context is missing, such as an entry widget on the dashboard.
- **Plugins export field groups, widgets or both** (`seo.section()`,
  `seo.widget('score')`), and the site places them. A plugin never rearranges
  the layout.

### The edit screen

- **Two named areas, main and sidebar, decided by the listing:**
  `fields: { main, sidebar }`, with no per-item position. Fields and widgets
  sit side by side in either. Media and users get `{ main, sidebar }` too.
  Rejected: Kirby's free columns with widths, and Payload's per-field position.
- **Fixed at the top of the sidebar:** status, publish and the slug; Save stays
  in the header. History, "used by", schedules and locales become core widgets
  in the sidebar by default, which the site can move or remove.
- **Tabs in main only.** Config validation refuses tabs in the sidebar with a
  clear message; groups and accordions are allowed there.
- **Phones:** the sidebar stacks below main, with Save and status in the sticky
  header; widgets go full width.
- **No per-user arrangement in 1.0**; stable keys keep it possible.

### Widgets and data

- **A widget in an edit area receives** `{ resource, id, locale, values,
setValue }`, the values live and unsaved. A dashboard widget receives
  nothing.
- **A widget that saves something of its own** (a redirect rule, a comment)
  uses an exported `WidgetForm`: it renders `<form noValidate>`, stops its
  submit from reaching anything above it, keeps its own form state, and turns
  off the save shortcut. It submits through the plugin's method client.
- **A widget that changes the entry being edited** writes through `setValue`,
  never the API, so the change goes through Save, autosave and drafts, and
  cannot bypass the edit lock or unsaved edits.
- **The page's Cmd/Ctrl+S always saves the entry**, even with focus in a
  widget's form, which submits only from its own button.

### Forms

- **No `<form>` element on edit screens.** This is what lets a widget or plugin
  render a real form without nesting. If it ever changes, every widget form
  and the rich-text link popover must be portalled out.
- **Enter in a field never saves the entry**, as in Payload, Directus,
  Statamic and Sanity; Enter keeps its meaning inside fields.
- **Our own validation.** Any `<form>` the admin renders gets `noValidate`;
  `required` stays for screen readers; a failed save moves focus to the first
  invalid field.
- **Password fields** on user screens go in their own widget form with the
  right `autocomplete` values, which password managers handle only because
  there is no outer form.

### The dashboard

- **Widgets only**, since fields need a form. `admin.dashboard: [...]` lists
  them in order with factory helpers (`recentEntries()`,
  `backups.widget('last-run')`); without a list, core widgets come first, then
  plugin widgets in plugin order.
- **Sizes:** `small | medium | large | full` on a 12-column grid that becomes
  one column on phones; widgets in a sidebar stack at full width.
- **Permissions:** an optional `permission` hides a widget, as `PluginSlot`
  does; core widgets use the read permission of what they show.
- **Core widgets for 1.0:** recent entries and entry counts (both exist),
  upcoming schedules, drafts with unpublished changes, and Site health counts
  (`roadmap/planned/site-health.md`). Later, from plugins: awaiting review,
  backups, activity.
- **Shell slots stay** for chrome (toolbar, right drawer, global overlay).
  Widgets reuse the slot's lazy loading and permission filter.

## The work

- [ ] The `Field | Layout | Widget` union through the renderer, codegen, field
      walkers and config validation; remove `affectsData`; `seo-preview`
      becomes a widget.
- [ ] `defineWidget`, plugin `admin.widgets`, the client manifest, context
      checks.
- [ ] `{ main, sidebar }` for media and users; tabs refused in the sidebar.
- [ ] Core sidebar widgets: history, used by, schedules, locales.
- [ ] Widget context, `setValue`, `WidgetForm`, and a hook for reading the
      entry's live values.
- [ ] The dashboard grid, `admin.dashboard`, core widgets, permissions.
- [ ] `TERMINOLOGY.md` (widget, layout) and `apps/docs`: placing widgets and
      writing one in a plugin.

## Testing

A widget in main and in the sidebar renders with the live values; `setValue`
marks the form dirty and the change saves with the entry; a `WidgetForm`
submit never triggers the entry's save, and Cmd/Ctrl+S inside it saves the
entry; Enter in a text field saves nothing; tabs in the sidebar and an entry
widget on the dashboard are config errors; a widget whose permission the user
lacks is absent; moving a field between main and sidebar leaves stored data
alone.
