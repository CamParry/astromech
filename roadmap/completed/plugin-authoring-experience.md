# Plugin authoring experience

**Status:** done. Phases 1 and 2 merged to `main` (2026-07-28, from
`feat/plugin-authoring-dx`); Phase 3 built on `feat/plugin-permissions`
(2026-07-29), gate + CLI verified.

The three items under "Still candidates" moved to
`roadmap/planned/plugin-factory-extras.md` — they were never designed, and one
of them (host-facing factory extras) is what the seo namespace remainder below
is really waiting on.

|         | scope                                                              | state                                                                               |
| ------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Phase 1 | one `definePlugin` call; identity-unaware sub-modules              | merged, gate + browser verified                                                     |
| 2d      | flatten `ctx.sdk`, delete scoped entries, move the permission seam | built (`fc63be5`), gate + browser verified                                          |
| 2b      | retire "SDK" → "service"                                           | built, gate verified                                                                |
| 2c      | dissolve `astromech/plugin-kit`                                    | built, gate + browser verified                                                      |
| 2a      | drop "plugin" from the define names                                | done, gate + browser verified; `definePluginTable` rename rejected (see remainders) |
| Phase 3 | `definePermissions`; the effect axis stays on service methods      | built 2026-07-29, gate + CLI verified                                               |

Sub-phases are sequenced rather than parallel: 2b, 2c and 2d all rewrite the
same plugin call sites, and 2d's deletion of `ctx.sdk` shrinks 2b's rename
surface. 2a runs last because it is the only one carrying design risk.

Make a plugin declare itself the way an app declares its config: **one
`definePlugin` call holding identity and behaviour together**, with nothing
inside the package importing the package's own identity to build a namespaced
string.

The old surface split identity into a leaf `plugin.ts` that half the package
imported — not because identity is naturally separate, but to dodge a cycle:
sub-modules needed the namespace to build absolute strings (`asset()`,
`locales()`, `tKey()`, `definePermissionBundles(plugin.package, …)`), and
`index.ts` imported those sub-modules. Removing the _need_ removes the cycle,
and the identity object with it.

**Principle: sub-modules declare _relative_ facts; the framework absolutizes
them at assembly.** Core already did this in two places — `defineAdminPage`
takes a bare `permission: 'view'` and namespaces it, and computes a settings
`baseKey` from a bare `path`. This generalises that to every surface.

## Phase 1 — the define seam

- [x] `definePlugin(definitionOrFactory)` — one argument, identity inline,
      always returns a factory. `PluginDefinition` was already
      `PluginIdentity & {…}`, so one object is the type's natural shape
- [x] `PluginDefinition.root` (`import.meta.url`) + relative asset specifier
      resolution in `codegen/plugin-client-manifest.ts`; published packages omit
      `root` and resolve to `<package>/<path>`. Kills `asset()`
- [x] `i18n: ['en', 'fr']` shorthand → `./locales/<code>.json`. Kills `locales()`
- [x] `permissionBundles` on the definition, surfaced namespaced as
      `plugin.permissions(bundle)` with literal bundle-name typing;
      `definePermissionBundles` removed
- [x] `PluginContext.plugin` — a plugin's own resolved identity, so runtime code
      builds namespaced strings from context instead of an import
- [x] `definePluginTable` accepts a package string literal
- [x] Migrate all five plugins; delete every `plugin.ts`
- [x] `.tsx` under `src/admin/{fields,pages}/` — rating matches the convention
      seo and backups already used; deleted two dead duplicate components
- [x] Rewrite `apps/docs/plugins/authoring.md` for the new surface

## Known remainders (deliberate, not oversights)

- **Table-bearing plugins keep one `<X>_PACKAGE` string const** in a
  dependency-free leaf. `definePluginTable` needs the package as a _literal
  type_ to derive `PluginDB` keys, and a value inside `definePlugin` can't reach
  a module-scope descriptor.

    The proposed fix — descriptors hold bare names, prefixed at assembly, with
    the literal recovered by a **type-only** import of `typeof plugin` from
    `index.ts` — was investigated in 2a and **rejected**. Three findings, any
    one of which is disqualifying:
    1. **It does not compile.** `import type` erases the _runtime_ edge, but the
       _type_ edge is real and self-referential: the descriptor's name type is
       `` `plugin_${PluginNamespace<typeof plugin['package']>}_<bare>` ``, while
       `typeof plugin` is inferred from an initializer containing that
       descriptor. tsc reports TS7022 on the plugin binding ("referenced
       directly or indirectly in its own initializer") and TS2456 on the alias.
       Widening `schema` to `TableDescriptor[]` doesn't help — inferring an
       un-annotated `const` resolves the whole initializer regardless. The only
       variant that compiles imports a _standalone_ binding whose type can't
       reach the descriptor (`export const PACKAGE = '…'` in `index.ts`, used as
       `typeof PACKAGE`), which relocates the const rather than deleting it and
       still can't put the literal inline in the definition object.
       dep-cruiser never gets a say: it cruises `packages/astromech/src` only,
       so plugin-internal cycles aren't cruised at all.
    2. **Two consumers read `descriptor.name` before any assembly exists.**
       `tableStorage` caches `kyselyTableKey(table.name)` in its constructor
       (`entries/storage/table.ts:91`) and redirects calls it at module scope
       (`entries/redirect.ts`), long before `registerPlugins` — a bare name
       there points every redirects query at `redirects`. And `plugin:generate`
       has no assembly _by design_ ("must never load `astromech.config.ts`"): it
       jiti-imports the schema module and writes both the migration SQL and
       `snapshot.json` from `table.name`. Each is fixable alone (a lazy
       `tableKey`; a prefix pass in the generator) — but descriptors are shared
       value objects, so prefixing at assembly means either mutating them in
       place (and `registerPlugins` is re-entrant, so that needs a
       `startsWith(prefix)` idempotency guard — exactly the double-prefix guard
       2a declines to add elsewhere) or cloning them, which strands every
       module-scope reference.
    3. **It trades a build error for a silent wrong-table bug.** Baking the
       package into the descriptor at define time is what lets two _independent_
       checks cross-validate identity: `plugin:generate` derives the prefix from
       `package.json`'s `name` and hard-exits on a mismatch, and
       `assertPluginTablePrefixes` derives it from the definition's `package` and
       throws on a mismatch. Prefix-at-assembly makes both tautologies — each
       would assert a string it had just constructed — so a disagreement between
       those two sources stops being a generate-time failure and becomes a
       plugin that migrates `plugin_a_x` and queries `plugin_b_x` in production.

    The payoff was two lines: neither `types.ts` is a leaf existing only for the
    const (redirects' also carries `REDIRECT_TYPE` and four types; backups'
    carries `BackupsOptions`), so no module is deleted. And the type machinery
    being repaired has **zero consumers** — nothing in the repo uses `PluginDB`
    or `KyselyTableKey`, and backups queries via a hand-written
    `const TABLE = 'plugin_backups_runs' as const`. No emitted table name would
    have changed, so it isn't a schema change; that is the only one of the three
    checks it passes.

    So `definePluginTable` keeps its name and its package argument. Renaming it
    to `defineTable` without the fix is strictly worse: root `astromech` would
    export a 4-arg `defineTable(pkg, name, cols, indexes)` beside the internal
    3-arg `defineTable(name, cols, indexes)` it wraps, both in
    `packages/astromech/src/database/`. Revisit only if `PluginDB` acquires a
    real consumer, and then compose the literal at the _consumption_ site
    (`PluginDB<typeof plugin, { runs: typeof runsTable }>`), which is acyclic
    because the tables don't depend on the plugin — that needs no runtime change
    at all.

- **seo hardcodes its own namespace literal.** `seoSection()` is called from the
  _site's_ config, so there is no assembly moment and no context to inject
  identity from. 2c deleted `labels.ts` and its `pluginNamespace` call, but the
  fact had to land somewhere: `fields/groups.ts` now writes `const NAMESPACE =
'seo'` by hand. That is a stand-in, not the fix. The fix is to hang
  host-facing helpers off the factory (`seo.section()`, as
  `plugin.permissions()` already does), which needs `definePlugin` to carry
  plugin-declared extras.

            This bullet used to say "— Phase 3", which was wrong and stayed wrong
            through the Phase 3 build: Phase 3 as designed is `definePermissions` and
            nothing else, and the factory-extras mechanism was never designed. Tracked
            in `roadmap/planned/plugin-factory-extras.md`; the stand-in survives until
            then and is harmless (seo has no tables, so no identifier derives from it).

- **Service module augmentation stays hand-written.** `declare module
'astromech' { interface AstromechPluginServices { seo: … } }` needs the
  service key as a source-level literal; TS cannot compute an interface key
  from a value's type.

## Phase 2 — one vocabulary, one context

Direction locked. Phase 1 made a plugin's _declaration_ identity-unaware; Phase 2
does the same to the _names_ it declares with and the _context_ it runs in.

**Principle: there is no separate plugin API.** A helper is named for what it
does, never for who calls it; whether a declaration is plugin-scoped is decided
by where it is registered, not by the name used to write it. `defineAdminPage`
already worked this way and is the model — one helper, host and plugin, with
core namespacing plugin registrations at assembly.

### 2a. Drop "plugin" from the define names

- [ ] `definePluginTable` → `defineTable` — **investigated and rejected**, not
      deferred. The rename and the literal-type fix are one job, and the fix
      doesn't compile, removes two identity cross-checks, and pays for it with
      two deleted lines. Full write-up in "Known remainders" above; that bullet
      is now the durable record and this box stays unticked on purpose
- [x] Delete `defineSdkMethod` — deprecated alias, zero callers _(done in 2b)_
- [x] Keep `defineEntryType`; there is no `defineEntry`. It defines a _type_,
      not content, and it earns its keep the moment an entry type is authored
      outside `defineConfig`'s call — a bare exported object is unchecked until
      it is spread in, and reports errors at the spread site. Now documented
      (`apps/docs/content/entry-types.md`) and demonstrated: the demo's `author`
      type moved to `apps/demo/src/entries/author.ts`
- [x] `defineServiceMethod`, `defineHook`, `defineConfig`, `defineAdminPage`,
      `definePlugin` — names already correct, unchanged. Verified: nothing else
      in the repo is named `define*Plugin*` bar `definePlugin` itself and
      `definePluginTable`
- [x] Document the admin-page path derivation rather than guarding it. A plugin
      declares a bare `path`; core mounts it at `/admin/plugin/<ns><path>` with
      `baseKey = 'plugin:<ns>:<path>'`. No enforcement of namespaced paths and
      no double-prefix guard — a declaration is relative by design. The host
      side is `/admin/page/<path>` with `baseKey = path` (not `/admin<path>` —
      there is a dedicated `page/$` route), and plugin paths lead with `/`
      while host paths do not

### 2b. Retire "SDK" → "service"

Not a software development kit; it is the set of methods a plugin exposes.
`defineServiceMethod` already sets the vocabulary. Pure identifier renames —
the `package` → `namespace` → key derivation is untouched, so every wire value
(HTTP route segment, `Astromech.plugins.<key>`) is byte-identical.

- [x] `sdk:` definition key → `service:`; `sdkKey` → `serviceKey` (42)
- [x] `PluginSdkMethod` → `PluginServiceMethod` (16); `SdkInterface` →
      `ServiceInterface` (14); `PluginSdkNamespace` → `PluginServiceNamespace` (8)
- [x] `AstromechPluginSdks` → `AstromechPluginServices` (10). The only breaking
      rename — it is the hand-written `declare module` augmentation. First-party
      only today
- [x] `types/sdk.ts` → `types/client.ts`. `AstromechClient` keeps its name; it
      genuinely is a client
- [x] Delete `AstromechPluginEntryTypes` and the codegen that emits it
      (`codegen/type-generator.ts:488`). Left dead by 2d — it existed only to
      type the removed per-plugin `entries` member. Touches the demo's generated
      `astromech.d.ts`

- [x] The published export map. `astromech/local` and `astromech/fetch` pointed
      at `dist/sdk/{local,fetch}/`, and two unused `astromech/sdk/*` subpath
      aliases sat beside them — the word surviving in the most user-visible
      place there is. Build output is now `dist/{local,fetch}/` and the aliases
      are deleted; nothing in the repo imported them

Also renamed as part of vocabulary consistency (not separately itemised above):
each plugin's own `src/sdk/*.ts` module → `src/service/*.ts` (redirects, menus,
seo, and the demo's rating), `pluginSdkKey` → `pluginServiceKey`,
`defineSdkMethod` deleted (deprecated zero-caller alias), and `generateSdkTypes`
→ `generateClientTypes` (the codegen entry point that emits the file `types/
sdk.ts` was renamed for).

### 2c. Dissolve `astromech/plugin-kit`

Verified **not** a runtime boundary: 20 runtime-reachable modules, all pure
(descriptors, codec, url, labels, identity, strings) plus `zod` / `ulidx` /
`@hono/zod-openapi`. No `getDb`, no `virtual:astromech/config`, no `kernel/`.
Root `astromech` (55 modules) already runtime-contains `codec.ts`,
`define-table.ts` and `entries/utils/url.ts`, and likewise pulls no virtual
module or db client. The subpath was curation only — the exact distinction 2a
deletes.

- [x] Move the generic exports to root `astromech`: descriptor type vocabulary,
      `decodeWith` / `encodeWith` / `encodePatchWith`, `tableStorage`,
      `resolveEntryUrl` / `resolveEntryPath`, `t` (the last two were already
      there). `definePluginTable` + `KyselyTableKey` + `PluginDB` moved too,
      keeping the name — the rename to `defineTable` stays 2a's job
- [x] Delete seo's `labels.ts` (`tKey`), the last caller of the identity
      helpers. `seoSection()` is host-facing config with no `PluginContext` to
      read identity from, so `fields/groups.ts` now hand-writes the derived
      namespace as a package-local `const NAMESPACE = 'seo'` — a deliberate
      stand-in for the Phase 3 factory-extras fix, not a design change
- [x] Drop `pluginNamespace` / `pluginServiceKey` / `pluginTablePrefix` from the
      public surface entirely. Reintroduce only if something needs them again —
      no `plugin-utilities` module for its own sake. They stay as internal
      modules core still uses (`plugin-generate`, `plugin-purge`, `plugin-schema`)
- [x] Delete the `plugin-kit` subpath export: the barrel, its `package.json`
      export, its tsup entry, and the vitest/tsconfig path aliases. No
      dependency-cruiser rule named it directly. All five plugins (redirects,
      seo, menus, backups; rating had no plugin-kit imports) now import these
      from root `astromech`

Noted, separate thread: `tableStorage` drags `@hono/zod-openapi` into the
runtime graph via the domain schema files, so "author a plugin table" currently
costs a server-flavoured dep.

### 2d. Flatten `ctx.sdk`, delete scoped entries

`ctx.sdk` is not a per-plugin object — it is the `Astromech` singleton itself
(`transport/local/index.ts:56`), so flattening copies references rather than
building wrappers. Real domain footprint across every installed plugin is
**entries, settings, media** only; `users`, `notifications`, `config` and
`plugins` have zero call sites, and `sdk.config` is already redundant with
`ctx.config` (`PluginConfigView` extends `ResolvedConfig`).

- [x] Remove `ctx.sdk`; surface the domains directly on `ctx`. Accepted cost:
      the near-miss pairs `ctx.user`/`ctx.users`, `ctx.plugin`/`ctx.plugins`,
      `ctx.notify`/`ctx.notifications`. `configure()` stops leaking onto context
- [x] Default shape `full` across the flattened domains — plugin altitude is
      trusted server code, and a `public` default hands it sanitized rich text
      and stripped private fields. Two of the three existing `ctx.sdk.settings`
      call sites already pass `{ full: true }` by hand. `entries` and `settings`
      are the two with a shape axis (`withDefaultShape` /
      `withDefaultSettingsShape`); `media`/`users`/`notifications` have none and
      pass through unwrapped
- [x] **Delete `createScopedEntries` and every consumer.** No implicit
      qualification anywhere: `ctx.entries` is the global entries service, and a
      plugin addresses its own types explicitly as
      `` `${ctx.plugin.namespace}/redirect` `` — built from context, never from
      an import, so the Phase 1 principle holds. Both construction sites go
      (`plugin-runtime.ts:437`, `transport/local/plugins.ts:44`), taking
      `Astromech.plugins.<key>.entries` with them: two entry points to the same
      content is the problem, not a feature
- [x] Retire the per-plugin HTTP mount `/plugins/<key>/entries`

    **This mount is the permission seam, not a convenience path.** It supplies
    `permissionFor: (t, a) => pluginEntryPermission(ns, t, a)`
    (`transport/http/routes/plugins.ts:89`). Removing it without replacement
    drops plugin entries onto the root router's `entry:<type>:<action>`
    derivation, which both breaks every plugin `permissionBundles` grant _and_
    brings plugin entries under the `entry:*` wildcard — a privilege escalation
    for `editor`. The replacement is to derive the permission from the type
    string in the single entries router: qualified → `plugin:<ns>:entry:<type>:<action>`,
    bare → `entry:<type>:<action>`. Safe as a pure string operation because
    `permissionNamespace` is assigned `namespace` verbatim
    (`plugin-identity.ts:90`) and namespaces are collision-checked at resolve
    time — nothing inverts the lossy derivation

    Landed as `entryPermission(typeId, action)` in
    `permissions/entry-permission.ts`, used by the one `createEntriesRouter()` —
    whose `lookup`/`qualify`/`permissionFor` options are gone with it. The
    qualified id reaches `:type` percent-encoded (client encodes, Hono decodes),
    so `/entries/redirects%2Fredirect` matches one segment. The admin's four
    plugin entry routes moved off the retired mount onto `Astromech.entries`.

- [x] Fixes a live bug: `qualifyEntryType` is unconditional string concatenation
      with no registry check, so a foreign or mistyped key neither throws nor
      passes through. Reads silently return empty; **writes silently succeed**,
      creating a ghost row stamped with an unregistered type and no field
      validation. `entries.create` now throws `UnknownEntryTypeError` on an
      unresolvable type; `qualifyEntryType` survives only where a plugin
      registers its OWN declared types, which are resolvable by construction
- [x] Update the redirects README — `Astromech.plugins.redirects.entries.create`
      becomes `Astromech.entries.create({ type: 'redirects/redirect', … })`

Accepted regression: a template-literal type argument degrades
`TypedEntriesApi`'s narrowing to `string`, so a plugin addressing its own types
loses the typing the merge otherwise gains.

Also dropped with the mount: the reservations on the SDK method name `entries`
and the raw-route path `/entries`, which existed only to protect it.

Permissions themselves are unchanged by Phase 2 — plugin altitude stays
trusted, with HTTP as the enforcement boundary. Neither surface checked
permissions before the merge (`scoped-entries.ts:8`, `transport/local/index.ts:8`).

Resolved (2026-07-29): `seo/src/service/seo.ts:44` reads its own settings blob
without `{ full: true }` and is **correct** — 2d closed this in the same phase
that raised it. `ctx.settings` is wrapped by
`withDefaultSettingsShape(requireClient().settings, 'full')`
(`plugins/runtime/plugin-runtime.ts:423`), which injects `full: true` whenever
the caller passes no `full` option.

The trap for anyone re-checking this: the _raw_ `settingsApi.get` still defaults
`full` to `false` (`settings/service.ts:53`) and returns `null` before any DB
round-trip for a non-public key. Reading that function alone says the opposite
of the truth at plugin altitude. It is why `backups/src/backup.ts:186` and
`menus/src/service/menus.ts:118` still pass a now-redundant `{ full: true }`
with comments asserting a private-by-default store — both are stale, tracked in
`roadmap/completed/plugin-consistency-sweep.md`.

## Phase 3 — `definePermissions`

Designed 2026-07-29. The trigger was a five-plugin audit (see
`roadmap/completed/plugin-consistency-sweep.md`), which found the permission
surface is the last one with no `define*` helper, and that its declaration half
is dead: `PluginDefinition.permissions` (`types/plugins.ts:298`) has **zero
consumers** anywhere in core. Three of five plugins dutifully write it and it
goes nowhere; `redirects` omits it and loses nothing.

### Decided: no auto-granting of plugin permissions

Investigated and **rejected**, deliberately, so it doesn't get re-raised: there
is no auto-opt-in, no per-plugin catch-all that roles inherit, and no global
`plugin:*` that a site opts out of.

The behaviour we want is already the behaviour we have. `admin` is `['*']`, so
it picks up every plugin permission that will ever exist. `editor` carries no
`plugin:` grant, so it gets nothing from a plugin until a site says so. And the
split is load-bearing by design, not by omission —
`permissions/entry-permission.ts:38` states that keeping the root and plugin
entry-permission forms apart "is what stops an `entry:*` grant from reaching
plugin entries."

Reasons the alternatives lose:

1. **Auto-grant everything** puts `backups:restore` and `backups:delete` on
   editors the moment the plugin is installed.
2. **A global `plugin:*` that must be opted out of** inverts the safe default:
   the site author has to know to decline a capability they never requested.
3. **Per-plugin catch-alls** (`plugin:seo:*`) already work with today's matcher
   (`matchesPermission('plugin:*', 'plugin:seo:view')` is true) and need no new
   code, so they stay available as the escape hatch — but they are all-or-nothing
   and don't answer the question, they relocate it.
4. **Classifying each permission by effect** (`read` / `write` / `destructive`)
   so core could auto-grant the safe tier was designed and dropped — see the
   effect-axis decision below, which is why.

Most sites run on the admin role; a site that deliberately runs editors
generally wants to state what those editors can reach. Defaults there cause
incidents rather than preventing toil. Nothing to build.

### Decided: groups are deleted, not renamed

`permissionBundles` was going to be renamed to permission _groups_. It is being
removed instead.

Under explicit opt-in a named group is a coarse handle that conceals what it
grants, and the repo already has the incident to prove it: the demo's
`content-editor` spreads `backups.permissions('manage')`
(`apps/demo/astromech.config.ts:141`), which expands to
`['read', 'run', 'restore', 'delete']` — so a content editor can restore and
delete the production database. One word, four permissions, one of them
catastrophic. Enumeration is the _point_ of an opt-in model, not friction to be
smoothed away.

So `definePermissions` takes **one** argument — the flat keyed declaration —
and the factory selects from it, literal-typed:

```ts
// permissions/backups.ts
export const backupsPermissions = definePermissions({
    read: {
        label: 'View backups',
        description: 'List backup runs and artifact metadata.',
    },
    run: { label: 'Trigger backup' },
    restore: { label: 'Restore from backup' },
    delete: { label: 'Delete backup' },
});
```

```ts
// a site's config
permissions: [
    ...builtInRole('editor'),
    ...backups.permissions('read'),
    ...seo.permissions('view'),
];
```

`key` stops being a field and becomes the record key, so the two parallel
exports every plugin writes today (`<x>PermissionBundles` + `<x>PermissionDefs`)
collapse to one. The helper owns the `const` type parameters, so `as const` —
currently load-bearing and silently droppable — stops being the author's
problem. `plugin:backups:*` remains available for "grant everything", and it is
honest because it _looks_ like everything.

- [x] `definePermissions(declaration)` — one argument, record keyed by bare
      permission key, `{ label, description? }` values
- [x] Factory accessor `plugin.permissions(...keys)` — variadic, literal-typed
      against the declaration, keeps the existing spread-at-call-site shape
- [x] Retire `PluginDefinition.permissionBundles` and the
      `factory.permissions(bundle)` bundle resolver (`index.ts:179-194`)
- [x] Give the declaration list a real consumer, or it stays as dead as the
      field it replaces. **Resolved: the CLI.** `astromech permissions` is a
      near-copy of the existing `methods` command — same args, same output
      shape, so it costs almost nothing and makes the declaration load-bearing
      immediately. It reads `buildPermissionCatalogue()`
      (`permissions/catalogue.ts`), which is pure and takes
      `(resolvedConfig, plugins)` exactly as `generateMethodManifest` does. An
      admin permissions matrix can consume the same catalogue later; it was not
      chosen now because it is a real UI surface and `unified-admin-pages` is
      already in flight
- [x] Core declares its own permissions through the same helper. There is no
      separate plugin API — the registration site decides scoping, exactly as
      `defineAdminPage` already works. `BUILT_IN_ROLES`' string literals
      (`permissions/index.ts:28-47`) become a declaration, and
      `builtInRole('editor')` becomes a selection over it

    Two things this surfaced, both now closed:

    **Keys must be one level deep, enforced.** There were two rules for turning
    a declared key into a permission string and they disagreed:
    `resolvePluginPermission` (`plugin-identity.ts:105`, the ENFORCEMENT side)
    passes any string containing `:` through unchanged so core permissions stay
    expressible, while the grant accessor prefixed unconditionally. A
    colon-bearing key therefore resolved differently depending on which side
    asked. `definePermissions` now throws on any key containing `:`, which makes
    the two agree for every key that can exist — this is what makes the "one
    level deep" rule true rather than aspirational.

    **Core needed an escape hatch from that rule.** `media:upload` and friends
    _are_ the full permission string — core is the root namespace, so there is
    nothing to prefix. Hence `defineAbsolutePermissions`, deliberately NOT
    exported from the package root: a plugin using it would write permission
    strings its own grant accessor could not reproduce.

    Wildcards (`*`, `entry:*`) are deliberately NOT in `CORE_PERMISSIONS`. A
    declaration lists grantable units; a wildcard is a matcher feature. Both
    built-in roles keep theirs as literals with a comment.

### Decided: `redirects` stops declaring entry permissions

`permissions/redirects.ts` deletes entirely. Its members
(`entry:${t}:read`, …) are a hand-maintained mirror of a derivation core
already owns: `entryPermission()` computes
`plugin:<ns>:entry:<type>:<action>` from the type id alone
(`permissions/entry-permission.ts:45-49`), at enforcement time, whether or not
the plugin declared anything.

Core enumerates them from the registered entry types instead. This is also what
makes the "one level deep" rule true — the colon-bearing keys were exactly the
ones that should never have been hand-written.

- [x] Core derives entry permissions per plugin entry type for the declaration
      list; delete `packages/plugins/redirects/src/permissions/redirects.ts`

          A site still has to _grant_ those permissions, and with nothing declared
          there was nothing to spread. The replacement is `entryPermissions(typeId,

    ...actions)` (`permissions/entry-permission.ts`), exported from the package
    root — core's own derivation, enumerated at the call site:

          ```ts
          ...entryPermissions('redirects/redirect', 'read', 'create', 'update', 'delete')
          ```

          That is what stops a site hand-writing
          `plugin:redirects:entry:redirect:*`, which is precisely the string this
          design exists to stop people writing. `redirects` now declares no
          permissions at all, which is correct: its one service method is `public`
          and its entry permissions are derived.

### Decided: the effect axis stays on service methods

`read` / `write` / `destructive` on a _permission_ was designed and dropped.
Effect describes an **action** — what happens when you call this. A permission
describes an **authorization** — who may. The axis already exists in the right
place: `defineServiceMethod` carries `mutates`, `destructive` and `idempotent`,
and `codegen/method-manifest.ts` projects them with an `effectDeclared` flag for
the AI confirm gate. Putting it on permissions too creates a second vocabulary
for one fact, guaranteed to drift the first time a method is gated on a
permission whose effect disagrees.

The useful change is enforcement, not duplication.
`mutates: serviceMethod.mutates ?? true` (`method-manifest.ts:332`) is a silent
fail-safe, and it is what reports `menus.get` — a public, pure read — as a
mutation with `effectDeclared: false`. Making the declaration mandatory turns a
runtime mislabel into a compile error.

- [x] Make `mutates` required on `PluginServiceMethod`; drop the `?? true`
      default once nothing relies on it

    One token in the end — `& Partial<ServiceMethodEffect>` became
    `& ServiceMethodEffect`, which already had `mutates` required and
    `destructive`/`idempotent` optional. `effectDeclared` went with it: once the
    declaration is mandatory the flag is always true, so it carried no
    information. Its only consumers were two tests and the generated manifest
    JSON, which already read `true` everywhere. All five plugin service modules
    already declared `mutates` (the consistency sweep fixed the last one), so no
    plugin source broke; three core test fixtures did need it added.

### What Phase 3 shipped

`definePermissions` + `defineAbsolutePermissions` (`permissions/define.ts`),
`CORE_PERMISSIONS` and a `builtInRole('editor')` built as a selection over it,
`entryPermissions()`, `buildPermissionCatalogue()` (`permissions/catalogue.ts`)
and the `astromech permissions` CLI, plus `mutates` made required. All four
plugins and the demo's `rating` migrated; `redirects/src/permissions/` deleted
outright.

Verified against the demo: 48 permissions — 11 core, 30 derived entry, 7
plugin-declared. `publish` appears only for `page` and `post`, the only two
versioned types, so the capability gate is real and not assumed.

Follow-ups moved to `roadmap/planned/plugin-factory-extras.md`.
