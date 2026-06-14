# Entry Schema & Authoring API — Redesign Spec

Status: **Locked, ready to implement.** Branch: `phase-18a-plugin-runtime`.
Supersedes the Phase 5 chained field builders (ROADMAP §18.5). Hard cut — no
deprecation, no `fieldGroups` alias.

## 1. Goal

Replace the `fieldGroups` model with a unified, recursive, object-settings
authoring API; dogfood it across the entire demo config and the redirects/seo
plugins; make all admin labels i18n-ready (the _seam_ now; _activation_
deferred). Driving value: a clean, low-ceremony, code-first DX with strong
types and predictable formatting.

## 2. Governing principles

1. **One recursive node.** An entry's schema is a tree of `FieldDefinition`
   nodes. Layout containers are _field types_, not a separate hierarchy.
2. **Layout vs data is the central split.**
    - **Layout containers — flat data, pure chrome:** `section`, `tabs`, `tab`,
      `accordion`. Children keep **top-level** data keys regardless of nesting.
    - **Data containers — nest data:** `group` (one nested object), `repeater`
      (array of objects), `blocks` (array of typed blocks).
    - **Everything flat by default.** Only `group`/`repeater`/`blocks` introduce
      a nested data key.
3. **Field names are globally unique within an entry.** Layout never
   namespaces them. (Two tabs cannot both contain `heading`; that case is
   _content translation_ via the `translatable` capability, not layout.)
4. **The edit page is two columns: `main` + `sidebar`.** Opinionated chrome,
   zero author input. No tab _region_. Tabs are a composable layout container
   placed wherever.
5. **Object settings, no chaining.** Eliminates the Phase 5 chaining-order TS
   limitation. Factories are pure functions returning plain `FieldDefinition`
   objects (POJOs) — no builder class, no `.build()`.

## 3. Authoring API

### 3.1 Entry `fields`

`EntryTypeConfig.fields` replaces `fieldGroups` and accepts **either**:

```ts
fields: FieldDefinition[]                              // chrome-less, single column
fields: { main: FieldDefinition[]; sidebar?: FieldDefinition[] }   // two columns
```

The _shape_ signals the layout — no `layout()` helper. `fieldGroups` is removed.

### 3.2 Call signatures

Every factory has the **same** shape — the machine **name** first, then a single
typed options object. No overloads. Child nodes live in `options.fields` (or
`options.blocks`), never as a trailing positional array.

- **Leaf field:** `type(name, options?)` — settings in a typed options object.
- **Container:** `type(name, options)` — children carried by `options.fields`
  (`options.blocks` for `blocks`).
- **First arg is always the machine name:**
    - _Has a data key_ (leaf fields, `group`, `repeater`, `blocks`) → the name **is**
      the data key.
    - _Pure chrome_ (`section`, `accordion`, `tab`) → the name is **inert** (never a
      data key); `label` is optional and, when omitted, the renderer derives the
      display title from the name (`titleCase`), exactly like an unlabelled leaf.
    - `tabs(options)` has no name — just `options.fields`.

```ts
text('title', { required: true });
section('content', {
    label: 'Page Content', // optional; omit to show "Content"
    fields: [richtext('body', { required: true }), textarea('excerpt')],
});
accordion('advanced', { collapsed: true, fields: [number('cache_ttl')] });
repeater('slides', { min: 1, fields: [text('caption')] });
tabs({
    fields: [
        tab('content', { fields: [text('title')] }),
        tab('seo', {
            label: 'SEO',
            fields: [section('meta', { fields: [text('metaTitle')] })],
        }),
    ],
});
group('address', { fields: [text('street'), text('city')] }); // data → nests as { address: { … } }
```

Rationale: a single uniform `(name, options?)` shape across every builder — leaf
and container alike — is the easiest to document and to learn. Children are a
labelled `fields:` key rather than a bare positional array, trading a little
verbosity for one consistent call form with no overloads.

### 3.3 Structural rules (validated at resolve time, not in the type system)

- `tab` only valid inside `tabs`.
- `sidebar` only valid at the top level (`fields.sidebar`).
- Crash-loud with the entry/field named, consistent with existing resolver
  validation.

### 3.4 Factory names

Keep all Phase 5 field factories: `text`, `textarea`, `richtext`, `number`,
`range`, `boolean`, `select`, `multiselect`, `radioGroup`, `checkboxGroup`,
`media`, `relationship`, `email`, `url`, `slug`, `color`, `date`, `datetime`,
`json`, `link`, `keyValue`, `group`, `accordion`, `repeater`, `blocks`.
**Add:** `section`, `tabs`, `tab`, `block` (one block variant inside `blocks`,
`block(type, { label?, icon?, fields })`). `relationship` (never `relation` — this fixes
the demo's silent `type:'relation'` bug, which currently renders as a plain text
input and generates no typed relations).

### 3.5 Exports

- **New subpath `astromech/fields`** (new tsup entry + exports-map entry): all
  field/layout factories, `section`/`tabs`/`tab`, and the `t` label descriptor.
  Supports `import * as f from 'astromech/fields'`. Pure functions → no
  module-singleton duplication risk across entry chunks.
- **Root `astromech`** keeps `defineConfig`, storage drivers, roles, the
  `define*` family.
- Internal plugins import from `@/builders/fields.js`.

## 4. Label i18n — the seam (build now)

### 4.1 Mechanism

One translation runtime: the admin SPA's i18next. Config never translates — it
_captures keys_.

- **`t(key)`** (config-time, exported from `astromech/fields`) returns a
  JSON-safe descriptor `{ $t: key }` that survives serialization into the
  virtual config module.
- **`resolveLabel(value, ns)`** (admin render): descriptor `{ $t }` →
  `t(value.$t, { ns })`; plain string → literal; omitted → `Titlecase(name)`.
- **Namespace** is derived from the route: plugin entries route through
  `/plugin/$name/entries/...` so `$name` = the namespace (= permissionNamespace);
  root entries → core `translation` ns. Thread `ns` from the entry page down via
  one prop/context (`useEntryNamespace()` reads route params).

### 4.2 Scope

Applies to: `single`, `plural`, section labels, field `label`, `checkboxLabel`,
`select` option labels, `adminColumns[].label`, `description`.

**No inline fallback** — `en.json` (via i18next `fallbackLng`) is the single
source of truth for the base string; a missing key echoes the key as an
untranslated signal.

**Out of scope for the seam** (follow-on): validation `message` strings, field
placeholders.

**User (root) config stays on literals** — `t()` is effectively plugin-facing
until an app-level catalog exists (see §6).

### 4.3 Dogfood

Redirects and seo re-expressed with `t()` keys + `locales/*.json`. `seoSection()`
routes its section + field labels through `t()` in the seo namespace.

## 5. Work breakdown (slice-by-slice, gated like Phase 5)

Gate per slice: `npm run typecheck` + `test:run` + `lint` (zero new problems over
the 54/49 baseline) + `build` + browser-verify on **:4323 only**.

1. **Types** — `EntryTypeConfig.fields` union (`FieldDefinition[] | {main, sidebar?}`);
   add `section`/`tabs`/`tab` to `CORE_FIELD_TYPES`; widen label-bearing fields to
   `string | MessageDescriptor`; add `MessageDescriptor`. Remove `fieldGroups`,
   `FieldGroupPlacement` tab member, `priority`, `FieldBuilderLike`.
2. **Builders** — replace `src/builders/fields.ts` with POJO-returning
   object-settings factories + `section`/`tabs`/`tab` + `t`; new `astromech/fields`
   entry. Delete the chained builders, `fields.test.ts` chaining-order test.
3. **Config-resolver** — resolve the new `fields` shape (array or `{main,sidebar}`)
   into the structure the renderer/type-gen consume; enforce layout=flat /
   data=nested; structural-rule validation; delete `normalizeField`/`.build()`,
   `sortFieldGroups`, priority.
4. **type-generator** — layout types recurse with **no name prefix** (children
   flat in `Fields`); data types (`group`/`repeater`/`blocks`) emit nested types
   (`group` → `{ name: { … } }`). Fixes today's `group_child` vs runtime-`group.child`
   mismatch.
5. **Renderer** — `entry-edit-page`/`entry-new-page`/`derive.ts`: two-column
   `main`/`sidebar`; recursive `section`/`tabs`/`accordion` rendering; **delete
   `tabGroups` + `FieldGroupTabs`** (tab region); rework the tabs renderer to the
   `tabs([tab(...)])` model; register a `SectionField`. New/changed admin CSS uses
   **logical properties** (`margin-inline`, `inset-inline`, …).
6. **Label seam** — `resolveLabel` + `useEntryNamespace`; thread `ns` and apply at
   all §4.2 sites.
7. **Migrate** — demo config (all entry types, incl. `showcase` kitchen-sink) +
   redirects + seo onto the new API; `seoFields` → `seoSection()` returning a
   section, `placement`/`priority` options dropped, labels via `t()`.
8. **Cleanup** — retire memory `builder-chaining-order-ts-limit`; update ROADMAP
   §18.5 noting the builder half was redesigned; update `specs/unified-architecture.md`
   cross-refs if needed.

## 6. Deferred — i18n activation (RECORDED, not built now)

The seam makes the admin _translatable_; these make it _translated_. Pick up when
demand justifies:

- **Language switcher** UI in the admin.
- **Per-user persistence** of the chosen admin language; drive i18next
  `changeLanguage` (currently `lng` is hardcoded `'en'` and nothing ever calls
  `changeLanguage`).
- **Core catalogs beyond `en`** (`src/admin/locales/*` is en-only today).
- **App-level catalog hook** so user-defined (root) entries get the same `t()`
  key mechanism plugins have.
- **Validation messages + placeholders** through the seam (§4.2 out-of-scope).

## 7. Deferred — RTL (RECORDED)

**LTR languages only. RTL deferred as a unit** (language + layout together) — no
half-support (RTL strings in an LTR shell reads broken). Cheap insurance taken
now: author admin CSS with **logical properties** so RTL mostly falls out later.
No RTL promise or testing until revisited.

## 8. Hard constraints (carry forward)

- Frozen characterization suite `src/sdk/local/entries.test.ts` — keep green;
  mechanical edits only if touched.
- NEVER stage/checkout/restore/write `demo/database.db` without asking. The demo
  DB's stored data for `showcase` `tab`/`accordion` fields goes stale under the
  layout-flat change — acceptable (disposable demo data), but do not silently
  commit it.
- Confirm before committing/pushing to `main` (feature-branch commits are fine).
- Audit sub-agent commits for `--no-verify`.

## 9. Resolved design questions (for the record)

- **Taxonomy:** `section`/`tabs`/`tab`/`accordion` = layout/flat;
  `group`/`repeater`/`blocks` = data/nested.
- **Tabs:** `tabs({ fields: [ tab(label, { fields }) ] })`; tabs hold fields and/or sections;
  globally-unique field names is the flat-model contract.
- **Signature:** name-for-data / label-for-chrome; positional children; settings
  object before the array.
- **Node model:** one recursive `FieldDefinition`; layout-as-types; structural
  rules validated at resolve time.
- **Phase 5:** rip out chained builders → POJO factories; keep `define*` +
  `searchable`; retire chaining-order memory.
- **Surface:** `astromech/fields` subpath + namespace export; keep Phase-5 names
  plus `section`/`tabs`/`tab`.
- **Priority:** removed (array order governs); no plugin auto-injection exists.
- **seo:** `seoSection()` returns a section; labels via `t()` in seo ns.
- **i18n seam:** route-derived namespace; `resolveLabel` over the §4.2 labels;
  validation/placeholders deferred; user config literal.
