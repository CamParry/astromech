# Menus, the `tree` field & clean settings translation

Status: planned. Supersedes the abandoned `@astromech/menus`-with-own-table idea and
the demo's stop-gap "menus as 2-level nested repeaters on the Globals page".

Mental model, decided across discussion:

- **Menus are a plugin feature**, not core — an add-on like redirects/seo.
- A menu's data **lives in settings** (one object blob per menu), edited through a
  generated **admin settings page per menu**. Not entries (locked-membership entries
  felt wrong), not a bespoke table.
- The **set of menus is developer-declared** in the plugin's options — a small, stable
  list of names the theme can rely on existing. Editors edit *contents*, not membership.
- The nested-builder UI is a **generic core field type, `tree`** — deliberately *not*
  menu-specific. It owns the storage structure (a recursive, drag-to-nest list of
  homogeneous nodes); it knows nothing about URLs or menus. The menus plugin supplies
  the node fields and does URL resolution.
- Translation is **top-level-field granular** (a translatable container is wholly shared
  or wholly per-locale). Leaf-level translation is explicitly out of scope — too complex.
  Menu entry-links localise *for free* via the entries locale system; only literal
  labels / custom URLs carry translated text.

Three independently-shippable deliverables, built in order:

1. **Settings translation cleanup** (prerequisite) — unify app-page and plugin-page
   settings on one storage shape + one save path, so both get clean i18n.
2. **`tree` core field type** — the generic nested builder.
3. **`@astromech/menus` plugin** — the consumer that ties 1 + 2 together.

---

## Deliverable 1 — Clean settings translation

### Problem

Translation today is split-brained. Merge-on-read is generic and lives in the SDK
(`settings.get(key, { locale })` → `mergeLocaleSetting(base, loc)`, a shallow
`{ ...base, ...localeValue }` over plain-object blobs). Partition-on-write lives only in
the **app-page** renderer (`page/$.tsx`), which calls `partitionGlobalValues` and writes
`<path>` (shared) + `<path>:<locale>` (per-locale). The **plugin** settings renderer
(`PluginSettingsPage.tsx`) instead writes **one key per field** (`plugin:<ns>:<field>`)
with no locale dimension, so it can never round-trip translations. Same KV table, two
renderers, only one translation-aware.

The object-merge model *requires* the page to be stored as a single object blob —
per-field scalar keys can't use it (the merge returns `base` for non-objects/arrays). So
the fix is to put **plugin settings pages onto the same blob shape** and share the write.

### Storage model (unified)

Every settings page — app or plugin — persists as **one object blob per page**, with a
per-locale companion when translatable:

- App page:    `<path>`                       + `<path>:<locale>`
- Plugin page: `plugin:<ns>:<pagePath>`        + `plugin:<ns>:<pagePath>:<locale>`

`<base>` holds the non-translatable (shared) top-level fields; `<base>:<locale>` holds the
translatable top-level fields for that locale. Read merges them (already implemented).

### Shared save helper

Extract the partition+write into a single client helper both renderers call, killing the
divergence:

```ts
// src/admin/lib/settings-page-save.ts  (new)
export async function saveSettingsPage(opts: {
  baseKey: string;                 // '<path>' or 'plugin:<ns>:<pagePath>'
  fields: ResolvedEntryFields;
  values: Record<string, unknown>;
  translatable: boolean;
  locale?: string;                 // required when translatable
}): Promise<void> {
  if (!opts.translatable) {
    await Astromech.settings.set(opts.baseKey, opts.values as JsonValue);
    return;
  }
  const { shared, perLocale } = partitionGlobalValues(opts.fields, opts.values);
  await Astromech.settings.set(opts.baseKey, shared as JsonValue);
  await Astromech.settings.set(`${opts.baseKey}:${opts.locale}`, perLocale as JsonValue);
}
```

Refactor `page/$.tsx`'s `handleSave` to call it (no behaviour change for app pages).

### Plugin settings renderer — bring to parity

`PluginSettingsPage.tsx` changes from per-field to blob:

- **Load** via `Astromech.settings.get(baseKey, translatable ? { locale } : undefined)`
  where `baseKey = 'plugin:' + permissionNamespace + ':' + pagePath`. (It currently
  filters `settings.all()` by prefix — replace with a single keyed get.)
- **Save** via `saveSettingsPage(...)`.
- Add a **locale switcher** (mirror `page/$.tsx`: a `Select` over `adminConfig.locales`,
  shown when the page is translatable) and re-seed values on locale change.
- Thread the new inputs in: `plugin/$.tsx` already resolves the `settingsPlugin` +
  `settingsPage`; pass `pagePath` (the page's `path`) and `translatable` down.

### Type changes

- `PluginPage` (`src/types/plugins.ts`): add `translatable?: boolean` (default false).
  `defineAdminPage` passes it through unchanged.
- No SDK signature changes — `settings.get`/`set` already suffice.

### Consumer migration (per-field → blob) — do not skip

The per-field `settings.get('plugin:<ns>:<field>')` read pattern goes away. Trace and
update every site (grep `plugin:` settings reads + `settings.all()` prefix filters):

- **`@astromech/seo`** — `src/plugins/seo/sdk/seo.ts` reads
  `plugin:astromech-seo:defaultOgImage` directly. Change to read the settings-page blob
  (`settings.get('plugin:astromech-seo:<settingsPagePath>')` then pick the field), or give
  the plugin a tiny typed accessor. Check `src/plugins/seo/pages/settings.ts` for the page
  path. Update any other seo settings reads.
- **demo `rating` plugin** — `demo/src/plugins/rating/pages/settings.ts` +
  wherever those settings are read.
- Anything in the plugin runtime (`src/core/plugin-runtime.ts` `makeConfigView`) that
  surfaces plugin settings.

This is a **breaking change to plugin-settings storage**. Pre-release, so no data
migration — just update the consumers and any seed/fixtures.

### Out of scope

Leaf/per-sub-key translation; typed `settings.get`; versioning for settings (tracked
separately in the Backlog).

---

## Deliverable 2 — `tree` core field type

A `tree` is a `repeater` **plus a `children` axis**: a recursive, drag-to-nest list of
homogeneous nodes. Same node schema at every level. Zero menu/URL semantics.

### Authoring API

```ts
import * as fields from 'astromech/fields';

fields.tree('items', {
  maxDepth: 3,                       // optional; unlimited if omitted
  fields: [                          // the node schema, applied at every depth
    fields.text('label'),
    fields.relationship('entry', { target: 'page' }),
    fields.url('url'),
  ],
});
```

```ts
// src/builders/fields.ts
type TreeOptions = BaseOptions & {
  min?: number;
  max?: number;
  maxDepth?: number;
  fields: FieldDefinition[];
};
export function tree(name: string, options: TreeOptions): FieldDefinition {
  const { fields, ...rest } = options;
  return { name, type: 'tree', ...rest, fields };
}
```

### Stored shape & reserved keys

A node is the user's field values plus reserved underscore keys (collision-safe, matching
the blocks/repeater convention):

```jsonc
[
  {
    "_id": "uuid",            // persisted, stable identity (good diffs/versioning)
    "_disabled": true,        // optional; omitted when enabled (default-by-absence)
    "label": "Products",      // user field
    "entry": "entry-id",      // user field
    "_children": [            // recursive; omitted/empty when leaf
      { "_id": "uuid", "label": "Shoes", "entry": "entry-id-2" }
    ]
  }
]
```

`_children` is the reserved nesting key (under the `_*` prefix, so it can't collide with a
user field). `_id`/`_disabled` behave exactly as in repeater/blocks. Reserved keys travel
through `onChange` untouched; the DB ignores `_*` on ingest (no strip step).

### Admin component

New `src/admin/components/fields/tree-field.tsx` + `tree-field.css`, modelled on
`repeater-field.tsx`. Structure:

- A **recursive `TreeNode`** renderer: collapsible header (drag handle, collapse,
  disable/duplicate/remove), the node's fields via `FormField`, then its `_children`
  rendered by the same component one depth deeper. Indentation + a left rule per depth.
- An **"Add" affordance** at root and per-node ("add child"), gated by `maxDepth`.
- **Drag-to-nest** (the WordPress-style feature). Primary approach: `@dnd-kit` sortable
  with **horizontal-drag depth projection** (the canonical dnd-kit sortable-tree pattern —
  flatten the tree to an ordered list with depth, project a target depth from pointer X
  during drag, clamp to `maxDepth` and to `parentDepth + 1`, rebuild the tree on drop).
  Acceptable v1 fallback if projection proves too large: drag-to-reorder within a level +
  explicit **indent/outdent** buttons to change nesting. Either way the *data* outcome
  (reorder + reparent) must work; don't ship reorder-only.
- A `use-tree-field.ts` hook may hold the flatten/project/rebuild + mutation helpers
  (mirror `use-blocks-field.ts`).

### Registration (full checklist)

- `src/types/fields.ts` — add `'tree'` to `CORE_FIELD_TYPES` (data container, **not** a
  layout type; leave the `LAYOUT_TYPES` sets alone). `FieldDefinition` already has
  `fields?`; add `maxDepth?: number`.
- `src/builders/fields.ts` — `TreeOptions` + `tree()` (above).
- `src/admin/components/fields/index.ts` — export `TreeField` (public `astromech/ui/fields`).
- `src/admin/definitions/register-fields.ts` — import `TreeField`,
  `registerField('tree', TreeField)`.
- `src/core/type-generator.ts` — add a `case 'tree':` after `repeater`. Emit a **named,
  self-referential** node type so the recursion terminates (do not infinitely inline):
  e.g. generate `interface <Field>Node { _id: string; _disabled?: boolean; …childFields;
  _children?: <Field>Node[] }` and type the field as `<Field>Node[]`.
- `src/admin/locales/en.json` — add `tree*` strings (node label, add-root, add-child,
  drag, collapse/expand, disable/enable, duplicate, remove, max-depth-reached), mirroring
  the `repeater*` keys.
- Validation (`src/core/plugin-fields.ts`) needs nothing — `tree` being in
  `CORE_FIELD_TYPES` already protects it from plugin shadowing.

### Tests

- Builder returns the right POJO; `maxDepth` passes through.
- Type-generator emits a terminating recursive node type for a `tree` field.
- Component: add root/child, reorder, reparent (indent/outdent or drag), depth clamp,
  disable, duplicate, `_id` stability across edits.

---

## Deliverable 3 — `@astromech/menus` plugin

First-party plugin at `src/plugins/menus/`, mirroring `src/plugins/redirects` /
`src/plugins/seo`. Wired into the demo, replacing the Globals-repeater menus.

### Options (developer-declared menu set)

```ts
// astromech.config.ts
import { menus } from '@astromech/menus'; // or 'astromech/plugins/menus'

plugins: [
  menus({
    menus: [
      { key: 'main',   label: 'Main Navigation' },
      { key: 'footer', label: 'Footer' },
    ],
  }),
]
```

`menus(options)` is a `definePlugin` factory that reads `options.menus` and **generates one
settings page + one nav child per menu**. Editors cannot add/remove menus (membership is
config); they edit each menu's tree.

### Per-menu settings page

For each `{ key, label }`, register via `defineAdminPage`:

- `path: 'menus/<key>'`, `label`, `translatable: true`.
- A single `tree` field (`'items'`) whose node schema is the menu item shape:
  - `label` — text, translatable (the literal link text)
  - `entry` — relationship (optional) — an internal entry reference
  - `url` — url (optional) — a custom/external link
  - `newTab` — boolean (optional)
  - resolution rule (in the SDK, not the field): `entry` set → resolve its URL; else
    `url`; else it's a label-only node.
- Stored at `plugin:<menusNs>:menus/<key>` (+ `:<locale>`) via Deliverable 1's blob model.

### Nav grouping

A "Menus" parent in the sidebar with a child per menu. Use the plugin nav tree
(`PluginNavItem` children — `sidebar.tsx` already renders nested/collapsible plugin nav
groups). Gate on `settings:read`.

### SDK — resolved read

```ts
const main = await Astromech.plugins.menus.get('main', { locale });
// → [{ label, url, newTab, children: [...] }]  (entry refs resolved to live URLs)
```

`menus.get(key, { locale })`:
- reads the blob `settings.get('plugin:<menusNs>:menus/<key>', { locale })`,
- walks the tree, drops `_disabled` nodes, maps `_children` → `children`,
- resolves each node's URL: `entry` → look up the entry (locale-aware via the entries
  system) and apply its type's `url` template through `resolveEntryUrl` (`src/core/entry-url.ts`);
  else use `url`; else omit.
- Define it with `defineSdkMethod` so the plugin owns its SDK typing.

### Permissions

Reuse `settings:read` / `settings:update` (these are settings pages). No new permission.

### Demo migration

- Replace the Globals page's `mainMenu`/`footerMenu` repeaters with the plugin
  (`menus({ menus: [{key:'main',…},{key:'footer',…}] })`).
- Update `demo/seed.ts` menu seeding to write the new blob keys.
- Update the demo front-end nav/footer to read via `Astromech.plugins.menus.get(...)`
  instead of `settings.get('globals').mainMenu`.

### Tests

- `menus.get` resolves entry refs to URLs, honours locale, skips disabled nodes, preserves
  nesting, falls back url→label.
- Generated pages/nav appear for each configured menu; none for unconfigured keys.

---

## Build order & isolation

1 and 2 are independent (disjoint files) → buildable in parallel. 3 depends on both.
Work in the main tree (no worktrees — the tree carries uncommitted work). Each deliverable:
`tsc --noEmit` clean + its own tests green before moving on.
