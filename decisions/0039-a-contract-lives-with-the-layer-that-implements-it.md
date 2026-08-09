# 0039 — A contract lives with the layer that implements it, and the plugin context is why the domain contracts cannot follow

**Date:** 2026-08-09
**Status:** accepted

`types/` was a pure leaf holding two things that are not leaf material.
`types/client.ts` declared `AstromechClient`, which composes all five domain
services — so the bottom of the DAG named the top of it, and did so with nothing
in the enforcement config saying anything about it. `types/services.ts` declares
the five contracts side by side, which is a co-location the DAG forbids for the
domains' code and permits for their types purely by accident of where the file
sits.

The reframe `roadmap/planned/domain-owned-service-contracts.md` proposed is
right about the first and, measured, wrong about the cost of the second.

## `AstromechClient` moved, and the file is named for the type

It lives at `transport/astromech-client.shared.ts`, beside its two
implementations, `transport/local/index.ts` and `transport/http/client/index.ts`.
Nothing else implements it and nothing below the delivery layer needs it.

The roadmap left the name open, flagging that `client.ts` collides with
`transport/http/client/`. Three candidates:

- **`transport/client.ts`** — the collision the roadmap named. A reader who sees
  it next to `transport/http/client/` has to work out which is the type and
  which is the fetch implementation.
- **`transport/client-contract.ts`** — the roadmap's placeholder. "Contract"
  is already taken in this codebase and means something narrower: a service
  method's declared metadata, as in `ServiceMethodContract`, `entriesContract`,
  `mediaContract`. A colliding name costs the reader more than a plain one.
- **`transport/astromech-client.shared.ts`** — named for the type it declares,
  which is what someone looking for `AstromechClient` searches. Matches how the
  repo already names a module for its principal export (`create-storage.ts`,
  `build-image-attrs.ts`, `entry-permission.ts`). The lowercase `astromechClient`
  const is one of its implementations, and the file header says so.

The third won.

## The `*.shared.ts` marker is load-bearing here, not decoration

`client-is-over-the-wire` forbids the fetch client from importing `transport/`
outside its own subtree. Renaming the new file without the marker made the rule
fire on exactly that edge, which is how the marker was confirmed to be doing
work rather than being applied out of habit. It is also the true claim:
`AstromechClient` erases at build time, names nothing but leaves, and the browser
bundle holds it. `shared-files-stay-browser-safe` now keeps it that way, which is
a property `types/client.ts` never had.

Same precedent and the same reasoning as
`decisions/0038-a-route-declares-itself.md`, which moved the route table to
`transport/http/routes/http-routes.shared.ts` for this reason and said in
passing that the next item was about moving transport contracts _out_ of
`types/`.

## The rest of `types/client.ts` was not client material

Splitting it was the part that made the move cheap:

- The typed-entry narrowing surface — `AstromechEntryTypes`, `TypedEntry`,
  `FieldsFor`, `TypedEntriesService` — is literal-type overloads over
  `EntriesService`. It has no transport in it, and stayed a leaf as
  `types/typed-entries.ts`, which is what the file had actually become.
- `ServiceInterface`, `AstromechPluginServices` and `PluginServiceNamespace`
  moved to `types/plugins.ts`, beside the `ServiceMethod` that `ServiceInterface`
  maps and the `PluginContext` that `PluginServiceNamespace` types.

Only `AstromechClient` itself went to `transport/`. Moving the whole file would
have dragged the typed-entry surface up with it, and `types/plugins.ts` would
then have reached from a leaf into the delivery layer.

## `plugins/runtime` declares a port instead of naming the client

The runtime held `client: AstromechClient | null` and a `setPluginClient` the
Local API calls at module load. Once `AstromechClient` was in `transport/`, that
became an upward edge from a capability, and `capabilities-no-upward` rejected
it — confirmed by pointing the runtime back at the transport type and watching
the rule fire.

The runtime never needed the whole client: it uses six service handles to fill
`PluginContext` and neither `config` nor `configure`. So it declares that slice
as `plugins/runtime/client-access.ts`, typed only from leaves, and the Local API
keeps injecting an `AstromechClient` structurally with no import either way.
This is the third instance of the inversion `entry-access.ts` and
`notify-access.ts` already carry, and the one
`decisions/0036-one-layer-table-and-a-shared-suffix.md` predicted would want the
same treatment. It carries no registry of its own because the slot already exists
on the runtime's state.

## Step 2 stopped on a measurement, not on an opinion

Step 0 of the roadmap checked one rule — `admin-only-client-and-pure-leaves` —
and concluded a domain-owned contract needed no carve-out. There are five. Adding
a type import of `@/entries/service` to one file per suspect rule reports:

```
leaves-are-pure                    src/utilities/with-default-shape.ts
leaves-are-pure                    src/types/typed-entries.ts
client-is-over-the-wire            src/transport/http/client/index.ts
capabilities-no-upward             src/plugins/runtime/client-access.ts
admin-only-client-and-pure-leaves  src/admin/hooks/entries.ts
```

Naming the contract files `*.shared.ts` clears the admin and the fetch client
with no config change at all — a better answer than the `dependencyTypesNot`
step 0 proposed, which opens a rule for every file it covers rather than for the
one that carries the marker. The other two have no structural answer:

**`PluginContext` flattens all five domain services onto itself**, so the
capability that builds it consumes all five contracts and no subset of them can
move cheaply. The exemption that would be needed sits on `capabilities-no-upward`
— generated for ten directories from the `LAYERS` table, where opening it also
lets `fields/` type-import `routes/`. Re-declaring the five shapes on the port
instead is precisely the second declaration that
`decisions/0038-a-route-declares-itself.md` is about.

**`utilities/with-default-shape.ts` wraps `EntriesService` and
`SettingsService`** and is imported for its value by `plugins/runtime`, so it can
neither move into a domain nor take the marker. It needs a `leaves-are-pure`
carve-out.

That is two new carve-outs, one of them on a generated layer rule, for a payoff
that is locality alone: no peer domain imports a peer's contract today, so the
coupling being removed is conceptual. The roadmap's own pass condition for step 1
— "a new carve-out means the move was wrong" — reads the same way here.

The item is not dead; it is now a design question rather than a type move.
Whether `PluginContext` should name the five domain contracts at all, or a
narrower per-capability port, decides it.

## `types/index.ts` keeps `export *`

The roadmap's step 3 asked whether the barrel should be narrowed so each import
site names what it really depends on. It should not, and the reason is that the
narrowing does not deliver the interface segregation the item wanted.
TypeScript's unit of invalidation is the module: a file writing
`import type { Entry } from '@/types/index'` is re-checked when
`types/plugins.ts` changes whether the barrel lists names or stars, because the
edge is to `types/index.ts` either way. Only deep imports cut it, which is churn
across roughly five hundred sites, for a property nothing then enforces — there
is no check that keeps a narrow barrel narrow.

The other stated benefit, making the real dependency visible, already has a
tool. `tsPreCompilationDeps` means `lint:deps` reports every type edge in the
tree, which is how step 2's blockers above were found in one command.

Recorded so it is not re-opened.
