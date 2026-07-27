# Plugin identity — implementation handoff

Execution plan for the coding session. **Design authority: `specs/plugin-identity.md`** — read it first; it holds the locked decisions, the derivation table, and the rejected alternatives with their evidence. This document is the _how_: file paths, exact changes, gates.

**Branch:** `feat/data-layer-step5-plugin-factory`, currently at `be35296`. Stay on it — verify with `git rev-parse --abbrev-ref HEAD` in the same command block as every commit. Hooks stay ON, never `--no-verify`. Do NOT push or merge to main without asking.

**Working tree at handoff:** clean, apart from the pre-existing untracked `roadmap/planned/drop-js-import-extensions.md` (not ours — leave it alone).

**Roadmap:** `roadmap/in-progress/table-definition-system.md` → "Step 6 — Plugin identity rework" holds the five checkboxes this work ticks.

---

## Context you must know before touching code

Paths below are relative to `packages/astromech/src/` unless prefixed otherwise.

- **What step 5 shipped and this supersedes:** `definePlugin({ alias, schema })` in `database/define-plugin.ts`, an alias-bound `{ table }` factory prefixing `plugin_<alias>_`. The alias came from `derivePluginName(package)` (last path segment) and was overridable via `PluginDefinition.alias`. That override is broken by construction — the prefix is baked into shipped migration SQL and the descriptor name is a module-load literal, so nothing moves at boot.
- **Two exports are both named `definePlugin` today:** the runtime factory in `index.ts:76` and the schema factory re-exported from `exports/plugin-kit.ts:18`. This work renames the second to `definePluginTable`.
- **`CamelCasePlugin` maps table identifiers too.** Kysely key for `plugin_backups_runs` is `pluginBackupsRuns`; leading-underscore names (`_astromech_*`) pass through untouched. `kyselyTableKey` in `database/codec.ts` and the type-level `KyselyTableKey` in `database/define-plugin.ts` are the runtime/type twins of this rule — keep them in sync.
- **Literal types matter.** `TableDescriptor<C, N>` carries a name-literal type param so `PluginDB<T>` can derive Kysely keys. Any derivation feeding a table name must preserve literals (`<const P extends string>` + a template-literal return type), or `PluginDB` silently degrades to `string` keys.
- **Tests:** `:memory:` dbs are poisoned after a storage transaction — use a per-test temp **file** db. `npm run test:run` skips tsc, so always run `npm run typecheck` too.
- Demo app loads the integration from `dist/`: core/plugin changes need a root build + dev-server restart before browser/HTTP verification.
- Root build DTS can OOM — `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.

### Baselines (as of `be35296`)

| Gate                | Baseline                                       |
| ------------------- | ---------------------------------------------- |
| `npm run typecheck` | 0 errors                                       |
| `npm run test:run`  | 924 passing (55 schema-engine + 869 astromech) |
| `npm run lint:deps` | 8 errors + 5 circular warnings — zero NEW ones |
| `npm run build`     | green, all workspaces                          |

### The finding that shrinks this job

**First-party migrations do NOT need regenerating.** `@astromech/redirects` derives `redirects` under the new rules, which is exactly the alias step 5 already used — so `plugin_redirects_redirects` and `plugin_backups_runs` are unchanged, and so is the `kysely_migration` chain. The only first-party behaviour change is the permission and i18n namespace shortening from `astromech-redirects` to `redirects`. Nothing is deployed, so that is free.

If you find yourself regenerating a plugin migration, stop — something has gone wrong with the derivation.

---

## A) Core identity — `plugins/runtime/plugin-identity.ts`

Current exports: `sanitisePackage`, `derivePluginName`, `pluginTablePrefix`, `pluginAssetRoot`, `titleCaseAlias`, `pluginEntryTypes`, `resolvePluginIdentity`, `resolvePluginPermission`, `assertNoPluginCollisions`, `satisfiesRange`, `checkPluginDependencies`.

**Replace `sanitisePackage` + `derivePluginName` with one function** implementing `specs/plugin-identity.md` §2:

```ts
/**
 * The one namespace a plugin owns, derived from its package name.
 * First-party (`@astromech/*`) strips its scope; everything else keeps it.
 *   `@astromech/redirects` → `redirects`
 *   `@acme/seo`            → `acme_seo`
 *   `acme-seo`             → `acme_seo`
 * Generic over the literal so `definePluginTable` can build a literal table name.
 */
export function pluginNamespace<const P extends string>(pkg: P): PluginNamespace<P>;

/** The JS-identifier form, for SDK/admin property keys: `acme_seo` → `acmeSeo`. */
export function pluginSdkKey(namespace: string): string;
```

The type-level `PluginNamespace<P>` needs a template-literal that strips a leading `@astromech/`, else strips `@` and replaces `/` and `-` with `_`. There is an existing `Camelize<S>` in `database/define-plugin.ts` you can lift for `pluginSdkKey`'s type twin if one is needed.

`pluginTablePrefix(namespace)` stays but now takes the namespace, not an alias.

**`resolvePluginIdentity`** — delete the `def.alias ?? def.name ?? derivePluginName(…)` chain. Identity becomes `{ package, namespace, sdkKey, permissionNamespace: namespace, version? }`.

**`assertNoPluginCollisions`** — compare derived namespaces; the error should name both packages and state that collisions are resolved by the plugin author, not the site (there is no override any more).

## B) Types — `types/plugins.ts`

- `PluginDefinition` (lines 208–225): **delete `name?` and `alias?`**. Keep `package`, `version?`, `label?`, `icon?`.
- `ResolvedPluginIdentity` (lines 273–279): replace `name`/`alias` with `namespace` + `sdkKey`.
- Add the `PluginIdentity` type the plugin packages will use with `satisfies` (§3 of the spec): `{ package: string; version?: string; label?: string; icon?: string }`.
- Update the `schema?` doc comment (line 232) — it still says "create via `definePlugin`" and `plugin_<alias>_`.

`types/plugins.ts` is already carved out of the `leaves-are-pure` dep-cruiser rule alongside `types/config.ts`; adding `PluginIdentity` there needs no rule change.

## C) The two factories

**`database/define-plugin.ts` → `database/define-plugin-table.ts`.** Replace the record form with a singular one taking the identity object:

```ts
export function definePluginTable<
    const I extends PluginIdentity,
    const N extends string,
    const C extends AnyCols,
>(
    identity: I,
    name: N,
    cols: (helpers: { col: ColFactory }) => C,
    indexes?: (helpers: { index: IndexFactory }) => IndexSpec[]
): TableDescriptor<C, `plugin_${PluginNamespace<I['package']>}_${N}`>;
```

Keep the existing guards (reject an already-prefixed name; prefix declared index names too) and keep `PluginDB` / `KyselyTableKey` working off the descriptor name literals. Delete `DefinePluginOptions` and `PrefixedDefineTable`.

**`index.ts:76` `definePlugin`** — new signature taking identity first:

```ts
export function definePlugin<Options = void>(
    identity: PluginIdentity,
    factory: (options?: Options) => Omit<PluginDefinition, keyof PluginIdentity>
): PluginFactory<Options>;
```

It merges `identity` into what the factory returns, so `index.ts` in a plugin package stops restating `package`/`version`/`label`/`icon`.

**`exports/plugin-kit.ts`** — export `definePluginTable` in place of the schema `definePlugin`; keep the whole descriptor type vocabulary export block (the comment there explains why: without it a plugin's `.d.ts` build hits TS2742).

## D) Engine identifier capping — `packages/schema-engine` + `database/descriptor-snapshot.ts`

Independent of A–C; can be done first or in parallel. Implements `specs/plugin-identity.md` §4.

1. **New pure helpers** in `packages/schema-engine/src/` (`model.ts` or a new `identifiers.ts`): `MAX_IDENTIFIER_BYTES = 63`, a deterministic FNV-1a `hash8()` (pure JS — the `.` barrel must stay edge/D1-safe, so no `node:crypto`), and `capIdentifier(name)` returning the input verbatim under the cap, else a truncated head + `_<hash8>` totalling exactly 63 bytes. Hash the FULL logical name so it is stable across regenerations. Guard non-ASCII rather than slicing mid-character.
2. **`database/descriptor-snapshot.ts`** — apply `capIdentifier` to every index name in `allIndexes()` (~line 112), covering both explicit descriptor indexes and the ones `synthesizedIndexes()` builds as `${table.name}_${toSnakeCase(key)}_unique` (~line 105). It must happen where the name enters the **snapshot**, not at render time — the differ compares the snapshot, so a capped render against an uncapped snapshot diffs on every run.
3. **`packages/schema-engine/src/ddl.ts:51`** — emit `CONSTRAINT \`<capIdentifier(\`${table}_${col}_fkey\`)>\` FOREIGN KEY …`instead of the bare`FOREIGN KEY`. Postgres auto-names unnamed FKs `<table>_<col>\_fkey` and truncates that silently.
4. **`packages/schema-engine/src/diff.ts`** (~line 253, where `indexNameCounts` already tallies duplicates) — add a generate-time **error** when a table name exceeds 63 bytes. Table names are never capped or hashed: a table name is something a developer types, so it fails loudly. Keep the duplicate-index-name check as the hash-collision backstop.

**Resolve and report before regenerating anything:** change 3 alters emitted DDL for every table with a foreign key. Determine whether the differ compares the structured snapshot (in which case it is inert) or rendered SQL (in which case it wants a full-table-rebuild migration across the app). If the latter, **stop and ask** — that is a decision for the main thread, not a side effect. Also check whether `tests/db/baseline-ddl-parity.test.ts` needs its hand-authored baseline updating now that FK constraint names appear.

Tests to add under `packages/schema-engine/tests/`: verbatim at 62 and 63 bytes, capped at 64, capped output exactly 63; **two names differing only past byte 63 must produce different results** (this is the Postgres bug being prevented — assert it explicitly); hash stability across calls; over-long table name produces a generate-time error.

## E) Consumers of the old identity fields

Every site below reads `identity.name`, `identity.alias`, or `permissionNamespace` and needs checking against the new shape:

- `transport/http/routes/plugins.ts:52,79` — route segment + entry permissions
- `plugins/runtime/plugin-admin.ts:82,94,116,122,146` — page permission keys
- `plugins/runtime/plugin-schema.ts` — `collectPluginSchemas` / `assertPluginTablePrefixes` (prefix now from namespace)
- `permissions/index.ts:12,72` — `definePermissionBundles` calls `sanitisePackage`
- `permissions/entry-permission.ts:18,22`
- `codegen/plugin-client-manifest.ts:21` — emits `identity.name` + `permissionNamespace`
- `admin/i18n.ts`, `admin/components/entries/mount.ts:59`, `admin/types/virtual-modules.d.ts:24` — i18n namespace
- `types/config.ts:395`

## F) Tracking + purge

- `_astromech_plugins` (declared in `database/schema.ts`): key on `package`, add `namespace` with a UNIQUE index so the collision is a database constraint. Note `CORE_TABLES` is currently 10 — keep it accurate.
- **This is a schema change to a core table, so it needs a generated app migration.** Run it from `apps/demo` directly: `npm run db:generate -- --name …` at the repo root loses the flag (npm folds it into a positional).
- `transport/cli/commands/plugin-purge.ts` — take the package (`@astromech/redirects`) rather than the alias, deriving the namespace for the LIKE pattern. **Keep the separator-underscore escaping** (`plugin\_<ns>\_%`); `_` is a single-char LIKE wildcard and an unescaped pattern silently dropped a neighbouring plugin's tables in step 5.
- `plugins/runtime/plugin-runtime.ts` — `trackPlugin` must keep using `encodePatch` (not `encode`) in `doUpdateSet`; the insert codec injects app defaults and re-stamps `installedAt` on every boot otherwise.

## G) Plugin packages — redirects, backups, menus, seo

`manifest.ts` → `plugin.ts` exporting one identity object (`as const satisfies PluginIdentity`). **The file must stay a leaf** — it has 12 importers and folding it into `index.ts` makes the package cyclic:

```
redirects: permissions/redirects.ts, index.ts
backups:   index.ts, permissions/backups.ts, backup.ts, pages/backups.ts
menus:     sdk/menus.ts, index.ts
seo:       index.ts, permissions/seo.ts, sdk/seo.ts, pages/overview.ts,
           fields/groups.ts, fields/seo-preview.ts
```

Keep the derived helpers that live there (`asset()`, `locales()`, `tKey()`, `PERMISSION_NAMESPACE`) — rebase them on the identity object rather than deleting them.

Schemas (`redirects/src/schema/redirects.ts`, `backups/src/schema/runs.ts`) move to `definePluginTable(plugin, …)`; each `index.ts` moves to `definePlugin(plugin, factory)` with the conditional-hooks spread.

## H) Docs

`apps/docs/plugins/authoring.md` — the "Database tables" section documents `definePlugin({ alias, schema })`; rewrite for `definePluginTable` and the identity object. Check for stale `alias` references elsewhere in that file.

---

## Suggested order

D is independent — do it first or in parallel. Otherwise A → B → C → E → F → G → H. A–C together will red the build until E is done; that is expected, don't try to keep every intermediate step green.

## Gates

Run all of these and report actual output:

```
npm run typecheck
npm run lint
npm run lint:deps          # 8 errors + 5 warnings baseline, zero NEW
npm run test:run           # 924 baseline
NODE_OPTIONS=--max-old-space-size=8192 npm run build
npm run db:generate        # expect: the §F tracking change only
```

Plus: fresh `db:init` — the table set and `kysely_migration` chain must be unchanged from `ce8db24` apart from the §F migration; both `plugin:generate` runs must report **no changes** (see the finding above); demo smoke covering `/admin`, a redirects read/create through `tableStorage`, and a backup run.

New unit coverage: the §2 derivation table as a table-driven test (including the `@acme/seo` vs `acme-seo` lossy case), the §5 collision error, and the §4 tests listed in D.
