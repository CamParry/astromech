# Plugin identity — locked decisions

**Status:** DESIGN LOCKED 2026-07-27, UNBUILT. Supersedes the identity half of `specs/data-layer-step5-handoff.md` §A (the `definePlugin({ alias, schema })` factory as shipped in `ce8db24`).

**Why this exists:** step 5 shipped two different public exports both named `definePlugin` — the runtime plugin factory from `astromech` and the scoped schema factory from `astromech/plugin-kit`. Pulling that thread exposed a deeper problem: the plugin `alias` was auto-derived, invisible to the author, site-overridable in a way that silently broke for any plugin owning tables, and entangled with physical names baked into shipped migration SQL.

---

## 1. Decisions

**D1. `package` is the single canonical identifier.** There is no declared `name`, no `alias`, and no site-level override. Every other representation derives from `package` mechanically.

**D2. Derivation is lossless and documented** (§2). The failure mode to avoid is TYPO3's — an _ambiguous_ transform, not derivation itself.

**D3. First-party plugins strip their scope.** A package under `@astromech/` derives from its last segment; everything else keeps its scope. Scope-matching cannot be spoofed — publishing under `@astromech/` needs our npm credentials.

**D4. Collisions are a hard install error, not a resolvable condition.** No admin-side rename. The check is a backstop for the one lossy edge case in §2, not the primary mechanism — npm already guarantees package uniqueness.

**D5. Identifier length is budgeted, never silently truncated** (§4).

**D6. Naming.** `definePlugin` stays the runtime plugin factory (`astromech`). The schema factory is renamed `definePluginTable` — **singular**, matching the one-file-per-table layout — and takes the identity object as its first argument.

**D7. `manifest.ts` survives as a file** but becomes one `plugin` identity object instead of loose constants. It is load-bearing: 12 importers across `permissions/`, `sdk/`, `pages/`, `fields/`, `schema/` and `index.ts`. Folding it into `index.ts` makes the plugin package cyclic.

---

## 2. Derivation rules

```
namespace(package):
  1. if package starts with "@astromech/" → take the last path segment
  2. else → strip "@", replace "/" and "-" with "_"
  3. lowercase
```

`namespace` is the **string form**, used for every stringly-typed namespace. The **JS form** is `camelCase(namespace)`, used only where a JS property key is required.

| package                   | namespace                | JS form               |
| ------------------------- | ------------------------ | --------------------- |
| `@astromech/redirects`    | `redirects`              | `redirects`           |
| `@astromech/backups`      | `backups`                | `backups`             |
| `@acme/seo`               | `acme_seo`               | `acmeSeo`             |
| `acme-seo` (unscoped)     | `acme_seo`               | `acmeSeo`             |
| `@acme-digital/seo-tools` | `acme_digital_seo_tools` | `acmeDigitalSeoTools` |

**Underscores, never hyphens.** This is a correctness requirement, not a preference: a hyphen does not survive Kysely's snake-case identifier mapping, so `plugin_acme-seo_*` could never round-trip to a `CamelCasePlugin` key.

**The one lossy case:** `@acme/seo` and unscoped `acme-seo` both derive `acme_seo`. Rare, and caught by §5.

### Where each form is used

| Surface                  | Form   | Example (`@acme/seo`)                 |
| ------------------------ | ------ | ------------------------------------- |
| Table prefix             | string | `plugin_acme_seo_settings`            |
| Index / constraint names | string | `plugin_acme_seo_settings_key_unique` |
| Permission namespace     | string | `plugin:acme_seo:view`                |
| i18n namespace           | string | `acme_seo`                            |
| Storage prefix           | string | `plugin/acme_seo/`                    |
| HTTP route segment       | string | `/api/plugins/acme_seo/*`             |
| SDK key                  | JS     | `sdk.acmeSeo`                         |
| Admin access key         | JS     | `Astromech.plugins.acmeSeo`           |

---

## 3. Authoring shape

```ts
// plugin.ts  (was manifest.ts)
export const plugin = {
    package: '@astromech/redirects',
    version: '0.1.0',
    label: 'Redirects',
    icon: 'Signpost',
} as const satisfies PluginIdentity;

// schema/redirects.ts  — one file per table
import { definePluginTable } from 'astromech/plugin-kit';
import { plugin } from '../plugin.js';

export const redirectsTable = definePluginTable(plugin, 'redirects', ({ col }) => ({
    id: col.id(),
    from: col.text({ notNull: true }),
    /* … */
}));

// index.ts — identity from arg 1, behaviour from the factory
export const redirects = definePlugin(plugin, (options: RedirectsOptions = {}) => {
    const { generateOnSlugChange } = withDefaults(DEFAULT_OPTIONS, options);
    return {
        schema: [redirectsTable],
        migrations: migrationProvider,
        entries: [redirectEntryType],
        sdk: redirectsSdk,
        ...(generateOnSlugChange && { hooks: [slugChangeHook] }),
    };
});
```

`as const` gives `package` a literal type, so `definePluginTable` can derive the table-name literal that `PluginDB` needs for its Kysely keys. `PluginIdentity` must be declared so `satisfies` checks the shape without widening.

---

## 4. Identifier length

**Verified limits.** SQLite and D1: no identifier length limit (tested a 196-char table with a 225-char index and an FK — all fine; Cloudflare's D1 limits page documents none). Postgres: 63 bytes, and overflow is a **NOTICE, not an error** — reproduced two indexes differing only past byte 63 truncating into `ERROR: relation … already exists`. v1 is SQLite-only, but a name baked into shipped migration SQL cannot be renamed later, so the budget is set now.

**Rules, in order:**

1. **Author-supplied index name** — prefixed, used verbatim.
2. **Auto-synthesized** `<table>_<cols>_unique` — used verbatim while ≤ 63 bytes.
3. **Over 63** — truncate the readable head and append `_<hash8>`, a deterministic hash of the logical `(table, columns, unique)` tuple. Must be stable across regenerations or every `plugin:generate` churns the migration. `diff.ts`'s existing duplicate-index-name tally stays as a hash-collision backstop.
4. **FK constraints are emitted with explicit names.** The inline `REFERENCES` form makes Postgres auto-generate `<table>_<col>_fkey` and truncate it silently — naming them ourselves removes PG's auto-naming from the budget.
5. **Table name over 63 → generate-time hard error.** Budget is `plugin_` + namespace + `_` + table ≤ 63, i.e. namespace + table ≤ 55. Erroring is defensible here because a table name is something you actually type.

Prior art: Odoo ships this exact bug (odoo/odoo#2780 — concatenated model names truncating into "relation already exists" at startup; community guidance is ≤16 chars per segment). Moodle instead budgets explicitly — tables 53, columns 63, site prefix capped at 10 — which is the model copied here.

---

## 5. Collision handling

- **Config resolution** — compare derived namespaces across the plugin set. No SQL, fires before anything runs. Replaces `assertNoPluginCollisions`.
- **Migrate time** — `_astromech_plugins` keys on `package` with a UNIQUE on `namespace`. The collision becomes a database constraint rather than hand-written validation, and the query names both the incumbent and the claimant.

Error, not warn, in both. The silent-success case is two plugins quietly sharing a table.

---

## 6. Implementation plan

**A. Core identity** (`plugins/runtime/plugin-identity.ts`)

- Replace `derivePluginName` + `sanitisePackage` with one `pluginNamespace(pkg)` implementing §2, generic over the literal (`<const P extends string>` returning a template-literal type) so `definePluginTable` gets a literal prefix.
- Add `pluginSdkKey(namespace)` for the JS form.
- Delete the `alias`/`name` fields from `PluginDefinition`; delete the `def.alias ?? def.name ?? derive(…)` chain in `resolvePluginIdentity`.
- `permissionNamespace` becomes the derived namespace (was the sanitised full package).

**B. `definePluginTable`** (`database/define-plugin.ts` → `database/define-plugin-table.ts`)

- Signature `definePluginTable(identity, name, cols, indexes?)`, singular, prefix from `identity.package`.
- Delete the `definePlugin({ alias, schema })` record form and its nested callback.
- `PluginDB` keeps working off the descriptor name literals.

**C. Runtime `definePlugin`** (`index.ts`)

- New signature `definePlugin(identity, factory)`; merge identity into the returned definition.

**D. Engine naming** (`packages/schema-engine`)

- Cap-and-hash in the index-name synthesizer; explicit FK constraint names in the DDL renderer; generate-time table-name length error.

**E. Plugin packages** (redirects, backups, menus, seo)

- `manifest.ts` → `plugin.ts` exporting one identity object; update the 12 import sites.
- Schemas to `definePluginTable`; `index.ts` to the new `definePlugin`.

**F. Tracking + purge**

- `_astromech_plugins` keyed on `package`, UNIQUE on `namespace`.
- `plugin:purge` takes the package (`@astromech/redirects`), clearer at a destructive call site.

**G. Docs** — `apps/docs/plugins/authoring.md`.

### Migrations do NOT need regenerating for first-party plugins

`@astromech/redirects` derives `redirects`, which is exactly the alias step 5 already used, so `plugin_redirects_redirects` and `plugin_backups_runs` are unchanged. The only first-party behaviour change is permission and i18n namespaces shortening from `astromech-redirects` to `redirects` — free, since nothing is deployed. Migration regeneration is only needed if the engine's index-naming change (D) alters an existing name; it should not, since every first-party name is well under 63.

---

## 7. Gates

- `npm run typecheck` / `lint` / `lint:deps` (no new errors) / `test:run` / `build`, all workspaces.
- Fresh `db:init` — table set unchanged from `ce8db24`, `kysely_migration` chain unchanged.
- `db:generate` and both `plugin:generate` runs report no changes.
- Demo smoke: `/admin`, a redirects read/create through `tableStorage`, a backup run.
- New unit coverage: §2 derivation table, the §4 cap-and-hash boundary at exactly 63, the §5 collision error.

---

## 8. Rejected alternatives

- **Short author-declared name + convention that third parties scope.** Redmine (defect #8824, colliding `tags` tables, and its own tutorial not modelling the convention), Home Assistant (a custom integration silently shadows a core one), WordPress (prefix guidance crept from plugin slug to `vendor_plugin_` because slug-only kept colliding) and Discourse all run this design and all have documented collisions. Unenforceable here without false-positiving private plugins.
- **Site-level alias override.** Cannot work: the prefix is baked into shipped migration SQL and the descriptor name is a module-load literal. Payload ships this feature and its own official search plugin shipped a bug where the override didn't propagate (payloadcms/payload#8842). No system surveyed offers admin-side rename without consequence.
- **Separate SDK-key and table-prefix identifiers.** Three identifiers for one plugin; rejected as convoluted.
- **Per-plugin database schema** (Backstage's answer — no prefix needed inside an isolated schema). Impossible on SQLite and D1.
- **Wrapping Drizzle's naming.** `drizzle-orm`'s `uniqueKeyName` is character-for-character our synthesizer (we inherited it) and drizzle-kit has no `NAMEDATALEN` guard, so it carries the same bug. Also undoes step 5's removal.

**Why derivation is safe here when it wasn't before:** the objection to `derivePluginName` was that it _lost_ information — you could not tell what alias a package would get. `@acme/seo` → `acme_seo` is mechanical and predictable. npm plays the role Salesforce's namespace registrar plays: a global, immutable, already-enforced uniqueness authority, which is what every system that successfully enforces qualified naming depends on and which we had wrongly assumed we lacked.
