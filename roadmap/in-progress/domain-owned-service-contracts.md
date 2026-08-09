# Domain-Owned Service Contracts

**Step 1 has landed and step 3 is decided. Step 2 is blocked** on a design
question it turned out to depend on, recorded under its own heading. The payoff
is structural rather than functional throughout.
`decisions/0039-a-contract-lives-with-the-layer-that-implements-it.md` has the
reasoning.

`types/` is 2807 lines across twelve modules behind one `export *` barrel that
every layer imports — 89 import sites in `admin/` alone. Two things follow from
centralising contracts in a leaf, and the second is the interesting one.

**Interface segregation, at module scale.** A domain that needs `Entry` pulls in
the config shape (567 lines), the plugin contract (436), the client surface (316)
and every other domain's service interface. An edit to `types/plugins.ts`
invalidates the typecheck of the whole graph.

**The leaf holds coupling the DAG forbids elsewhere.** `types/services.ts`
declares `EntriesService`, `MediaService`, `UsersService`, `SettingsService` and
`NotificationsService` side by side. `domain-no-upward` stops peer domains
importing each other's code; their contracts are already co-located, so the
coupling exists at the type level with nothing saying so. A domain that does not
own its own interface is an implementation of somebody else's.

The strain is already visible in the enforcement config. `leaves-are-pure` carves
out `types/config.ts` and `types/plugins.ts` by path, because both compose types
that live above them (`EntryStorage`, `TableDescriptor`, the Kysely DB). The
carve-outs are correct and well-documented; they exist because contracts were put
somewhere they then had to reach up out of.

## The reframe

Two files in `types/` are not leaf material:

- **`types/services.ts`** holds five domain contracts. Each belongs to its
  domain — `EntriesService` in `entries/`, `MediaService` in `media/`.
- **`types/client.ts`** held `AstromechClient`, which composes all five. That is
  a **transport** contract, not a leaf contract: its implementations are
  `transport/local/index.ts` and `transport/http/client/index.ts`, and its
  consumers are the transports. Sitting in the leaf is what forced it to reach
  upward for all five services. Moved in step 1.

What stays in `types/` is the vocabulary genuinely shared by every layer:
`domain.ts` (`Entry`, `User`, `Media`, `Setting`, `Notification`, `JsonValue`,
`Permission`, `Role`), `fields.ts`, `methods.ts`, `hooks.ts`, `resolved.ts`, and
the query primitives (`SortOption`, `SortDirection`, `QueryResult`,
`WhereFilters`).

Moved this way, `AstromechClient` composing five services becomes a normal
downward edge from `transport/` to the domains, and the two remaining leaf
carve-outs are unaffected.

## Change

### 0. Verify dependency-cruiser can distinguish a type-only edge

**Answered: it can. This item proceeds.**

Consumers of a domain's contract include `admin/`, which may only reach pure
leaves and files carrying the `*.shared.ts` marker. A type import erases at
runtime and costs nothing in the bundle, but `leaves-are-pure` and
`admin-only-client-and-pure-leaves` match on path alone.

- [x] Confirm dependency-cruiser reports `type-only` in `dependencyTypes` for
      `import type` in this TypeScript setup, and that a rule can exclude it via
      `dependencyTypesNot`. Measured against
      `packages/astromech/.dependency-cruiser.cjs`, whose
      `tsPreCompilationDeps` is what makes the distinction available at all. A
      type import of `SettingsService` from `@/settings/service`, added to
      `admin/lib/settings-page-save.ts`, is reported with `type-only` in its
      `dependencyTypes` alongside `aliased-tsconfig-paths`, `local` and
      `import`; the sibling value import of the same module carries the same
      list without `type-only`. Adding `dependencyTypesNot` to
      `admin-only-client-and-pure-leaves` cleared the type-only edge and still
      failed the value import of the same module from the same file. The key
      belongs inside `to`, not at the top level of a rule — at the top level the
      config fails schema validation on an additional property.
- [x] If it can: the admin's type imports of domain contracts are expressible
      without an allowlist entry, and this item proceeds. A domain contract the
      admin imports as a type needs no `*.shared.ts` rename and no carve-out —
      the rule that admits it is one key on the existing rule.
      The other branch — contracts reaching the admin as `*.shared.ts` files per
      `roadmap/completed/module-boundary-enforcement.md` step 2 — did not apply, so it
      is not outstanding work. It is recorded because step 2 later found a narrower
      version of the same question: the marker turned out to be the better answer for
      the two rules it can reach, and `dependencyTypesNot` the worse one, because the
      marker scopes to the file that carries it while the key opens a whole rule.

One caveat for step 2. `dependencyTypesNot: ['type-only']` opens the exemption
for the whole rule, not for the contracts alone: any admin file could then
`import type` from any domain service implementation. That is acceptable for a
type erased at build time, and `verbatimModuleSyntax` keeps an accidental value
import from hiding inside one, but it is a wider hole than the `*.shared.ts`
marker, which stays scoped to the file that carries it.

### 1. Move `AstromechClient` to the transport layer

**Done.** Independently valuable and did not depend on step 2, so it landed
alone.

- [x] Moved to `transport/astromech-client.shared.ts`. The name beat
      `transport/client.ts` (collides with `transport/http/client/`) and
      `transport/client-contract.ts` ("contract" already means a service
      method's declared metadata here). The `.shared.ts` marker is what admits
      it to the fetch client; without it `client-is-over-the-wire` rejects the
      import, confirmed by renaming the file and watching the rule fire.
- [x] Updated `transport/local/index.ts`, `transport/http/client/index.ts` and
      `src/index.ts`, which re-exports it so the public `astromech` surface is
      unchanged. `admin/` needed no change: it never names `AstromechClient`.
      The `exports/` barrels needed no change either — they re-export `src/index`
      and the two transports wholesale.
- [x] `lint:deps` unchanged at 0 errors / 3 warnings, no new carve-out. The
      three `no-circular` warnings are each one hop shorter now that
      `types/client.ts` is out of them.

Two things in the old `types/client.ts` were not client material and did not go
to `transport/`: the typed-entry narrowing surface stayed a leaf as
`types/typed-entries.ts`, and `ServiceInterface` / `AstromechPluginServices` /
`PluginServiceNamespace` moved to `types/plugins.ts`, beside the `ServiceMethod`
they map.

- [x] `plugins/runtime` is a capability and may not import `transport/`. It
      never needed the whole client — only the six service handles it flattens
      onto `PluginContext` — so it declares that slice as
      `plugins/runtime/client-access.ts`, typed from leaves, and the Local API
      keeps injecting an `AstromechClient` into it structurally. Same inversion
      as `entry-access.ts` and `notify-access.ts`.

### 2. Move each service interface to its domain

**Blocked, and the blocker is `PluginContext`.** Step 0 measured one rule; there
are five. Probed by adding a type import of `@/entries/service` to one file per
affected rule and reading the scan:

```
leaves-are-pure                    src/utilities/with-default-shape.ts
leaves-are-pure                    src/types/typed-entries.ts
client-is-over-the-wire            src/transport/http/client/index.ts
capabilities-no-upward             src/plugins/runtime/client-access.ts
admin-only-client-and-pure-leaves  src/admin/hooks/entries.ts
```

Naming the contract files `*.shared.ts` clears the admin and the fetch client
with no config change at all — better than the `dependencyTypesNot` step 0
proposed, which opens a rule for every file it covers. It does not clear the
other two, and neither of those has a structural answer:

- **`plugins/runtime` consumes all five contracts, because `PluginContext`
  flattens all five onto itself** (`ctx.entries`, `ctx.media`, `ctx.settings`,
  `ctx.users`, `ctx.notifications`). So there is no subset of the five that can
  move cheaply, and the exemption needed is on `capabilities-no-upward` — a
  rule generated for ten directories from the `LAYERS` table, where an
  exemption also lets `fields/` type-import `routes/`. Re-declaring the five
  shapes on the port instead is the second declaration that drifts.
- **`utilities/with-default-shape.ts` wraps `EntriesService` and
  `SettingsService`** and is imported for its VALUE by `plugins/runtime`, so it
  cannot move into a domain and the `*.shared.ts` marker does not apply to it.
  It needs a `leaves-are-pure` carve-out.

Two new carve-outs, one of them on a generated layer rule, against a payoff
that is locality alone: nothing in the graph today has a peer domain importing
a peer's contract, so the coupling being removed is conceptual. Step 1's own
pass condition — "a new carve-out means the move was wrong" — reads the same
way here. **Re-scope before retrying:** the question this item now turns on is
whether `PluginContext` should name the five domain contracts at all, or a
narrower per-capability port. That is a design change, not a type move.

Answers to the two open questions, for whoever picks it up:

- **Notifications.** `NotificationsService` is the client-facing session-scoped
  shape (no `userId`; each transport fills the subject from the session) and is
  the contract, so it belongs in `notifications/`. `NotificationsDomainService`
  is the server-side shape and already lives in `notifications/service.ts`. Both
  end up in the domain, as two deliberately different types.
- **The query primitives.** They stay leaves, but not in a `services.ts` that
  holds only them — `AllLocales`, `SortDirection`, `SortOption`,
  `ReferencesFilter`, `WhereFilters`, `QueryOptions` and `QueryResult` become
  `types/query.ts`, a file named for what it holds. Folding them into
  `types/domain.ts` loses that: `domain.ts` is the data model, and a sort
  direction is not part of it.

- [ ] `EntriesService` and the entry query/param types → `entries/types.ts`.
      `MediaService` → `media/types.ts`. Same for `users`, `settings`,
      `notifications`.
- [ ] Each domain's `index.ts` re-exports its own contract, so the public
      `astromech` surface is unchanged for consumers.
- [ ] The plugin packages import contracts through the root `astromech` barrel
      and must keep working unchanged — `npm run check:node-imports` is the check
      that says so.

### 3. Narrow the barrel

**Decided: `types/index.ts` keeps `export *`.** Not re-opened.

- [x] The narrowing does not buy what this item wanted. TypeScript's unit of
      invalidation is the module, not the named export: a file that writes
      `import type { Entry } from '@/types/index'` is re-checked when
      `types/plugins.ts` changes whether the barrel lists names or stars, because
      the edge is to `types/index.ts` either way. Only deep imports
      (`@/types/domain`) cut it, and that is churn across ~500 sites for a
      property nothing then enforces — a narrow barrel has no check keeping it
      narrow.
- [x] The stated benefit, "makes the real dependency visible at each import
      site", already has a tool. `tsPreCompilationDeps` means `lint:deps` reports
      every type edge, which is how step 2's blockers above were found in one
      command. Visibility is not what is missing.
- [x] Interface segregation comes from splitting the module, which is step 2.
      Doing the barrel first would spend the churn and leave the fan-in intact.

## Notes / caveats

- **Type-only refactor: no runtime code changes, no migration, no behaviour
  change.** The gate is the whole safety net, and `typecheck` is the real one.
  A green typecheck plus an unchanged `lint:deps` output is the pass condition.
- **Sequencing.** This conflicts with almost everything, because it touches
  import lines across the tree. It should land in a quiet window, and it should
  land after `manifest-driven-transports.md`, which rewrites the two largest
  consumers of `types/services.ts` and would otherwise conflict head-on.
- Step 1 is the cheap half and carries most of the conceptual payoff. If only one
  step of this ever happens, it should be that one.
- The two existing `leaves-are-pure` carve-outs (`types/config.ts`,
  `types/plugins.ts`) are out of scope. They compose authoring contracts that
  genuinely belong to the public surface, and nothing here improves them.
- `roadmap/planned/admin-as-its-own-package.md` gets easier if this lands first:
  a domain that owns its contract is a domain the admin can depend on by type
  across a package boundary without a deep import.
