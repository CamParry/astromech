# Domain-Owned Service Contracts

**Status:** planned, not designed. The direction below is researched but the
first step is a feasibility check that can kill it, and the payoff is structural
rather than functional. Do not start this ahead of
`roadmap/planned/manifest-driven-transports.md`.

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
- **`types/client.ts`** holds `AstromechClient`, which composes all five. That is
  a **transport** contract, not a leaf contract: its implementations are
  `transport/local/index.ts` and `transport/http/client/index.ts`, and its
  consumers are the admin and the transports. Sitting in the leaf is what forces
  it to reach upward for all five services.

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

**This step can kill the whole item, so it goes first and costs an afternoon.**

Consumers of a domain's contract include `admin/`, which may only reach pure
leaves and an allowlisted set of browser-safe files. A type import erases at
runtime and costs nothing in the bundle, but `leaves-are-pure` and
`admin-only-client-and-pure-leaves` currently match on path alone.

- [ ] Confirm dependency-cruiser reports `type-only` in `dependencyTypes` for
      `import type` in this TypeScript setup, and that a rule can exclude it via
      `dependencyTypesNot`.
- [ ] If it can: the admin's type imports of domain contracts are expressible
      without an allowlist entry, and this item proceeds.
- [ ] If it cannot: the contracts have to reach the admin as `*.shared.ts` files
      per `roadmap/planned/module-boundary-enforcement.md` step 2, which is a
      larger and less obviously worthwhile change. Record the finding here and
      re-decide rather than pushing on.

### 1. Move `AstromechClient` to the transport layer

Independently valuable and does not depend on step 2, so it can land alone.

- [ ] Move `types/client.ts` to `transport/client-contract.ts` (name to be
      settled — `client.ts` collides with `transport/http/client/`).
- [ ] Update `transport/local/index.ts`, `transport/http/client/index.ts`,
      `admin/`, and the `exports/` barrels that re-export it publicly.
- [ ] Confirm `lint:deps` is unchanged or improved, and that no new carve-out
      was needed. A new carve-out means the move was wrong.

### 2. Move each service interface to its domain

- [ ] `EntriesService` and the entry query/param types → `entries/types.ts`.
      `MediaService` → `media/types.ts`. Same for `users`, `settings`,
      `notifications`.
- [ ] Leave the cross-domain query primitives in `types/services.ts`, or fold
      them into `types/domain.ts` and delete the file. Decide once; a
      `services.ts` holding only `SortOption` is a file that will re-accumulate.
- [ ] Each domain's `index.ts` re-exports its own contract, so the public
      `astromech` surface is unchanged for consumers.
- [ ] The plugin packages import contracts through the root `astromech` barrel
      and must keep working unchanged — `npm run check:node-imports` is the check
      that says so.

### 3. Narrow the barrel

- [ ] Decide whether `types/index.ts` keeps `export *`. It is convenient and it
      is also why nobody notices the fan-in. A narrower barrel makes the real
      dependency visible at each import site, at the cost of churn across
      hundreds of files.
- [ ] If the answer is "keep it", say so here with the reason, so this is not
      re-opened annually.

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
