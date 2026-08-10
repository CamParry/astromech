# 0042 — Domain contracts stay centralised in the types leaf

**Date:** 2026-08-10
**Status:** accepted
**Supersedes:** 0039, in the step 2 claim only — everything else in that record stands

0039 moved `AstromechClient` to `transport/` under the principle "a contract
lives with the layer that implements it", then stopped step 2 (moving the five
domain service contracts) on the cost of two new carve-outs. This record closes
step 2 as decided-against: the principle does not transfer, and centralised
contracts are the correct position for this codebase's actual architecture.

## Why the principle does not transfer

0039's principle comes from hexagonal architecture, where the domain is the
innermost layer and defines its ports. Astromech's DAG is not hexagonal. The
innermost layer is `types/`, not the domains. Contracts sitting in the innermost
layer is exactly what hexagonal prescribes — Astromech just calls that layer
`types/` instead of `domain/ports/`.

`AstromechClient` moved successfully because both its implementations and both
its consumers were in `transport/`. The five service contracts have one
implementor each and consumers in every layer — `admin/` (10 files),
`transport/` (5), `plugins/` (2), `types/` itself (4), `utilities/` (1), every
domain (1 each), and `policies/` (1). That fan-in is the shape of shared
vocabulary, not an implementation detail of a single layer.

## Why TypeScript favours centralisation for cross-module contracts

Types erase. There is no runtime cost to centralisation, and TypeScript's module
graph rewards having shared types at the bottom of the dependency tree: every
layer can reach them without an upward edge, no cycles form through them, and
every consumer gets a single import path through the barrel.

The dominant pattern in the TypeScript ecosystem — tRPC, Prisma, Payload,
Strapi, Nx monorepos — puts cross-module contracts in a central location.
Co-location is the convention for types internal to a module, not for contracts
consumed across the codebase.

## What was rejected

**Moving contracts to domains with `dependencyTypesNot: ['type-only']` on the
blocking rules.** This was the lowest-cost path: one key on two rules, no
carve-outs, no barrel churn. The type-only exemption is sound (`verbatimModuleSyntax`
prevents a type import from smuggling a value), and 0039 called it "acceptable
for a type erased at build time". But it solves a cost problem in service of a
principle that does not hold here — the layer rules should not need loosening to
accommodate a move that is fighting the architecture rather than following it.

**Redesigning `PluginContext` to use narrower per-capability ports.** This
would break the plugin API to buy a type move. `ctx.entries`, `ctx.media`,
`ctx.settings`, `ctx.users`, `ctx.notifications` is the product design.
Re-declaring five service shapes on a narrower port is the second declaration
that drifts, exactly the problem 0038 recorded.

## What survives

The query primitives — `AllLocales`, `SortDirection`, `SortOption`,
`ReferencesFilter`, `WhereFilters`, `QueryOptions`, `QueryResult` — split from
`types/services.ts` into `types/query.ts`. They are shared vocabulary
(operations over the data model, not contracts of any domain), and the 377-line
file is doing two jobs. The split is internal to the leaf; the barrel re-exports
both, and no consumer changes.

`with-default-shape.ts` has one consumer (`plugins/runtime/plugin-runtime.ts`).
If it ever blocks future work, the file moves into `plugins/runtime/` — noted
here so the option is on record, not because it needs doing now.

## What this means for `client-access.ts`

`plugins/runtime/client-access.ts` re-declares the client slice shape typed from
leaves, without importing the domain contracts directly. That inversion is
correct and stays: it exists because the capability layer must not import the
transport layer (where `AstromechClient` lives), not because of where the service
contracts sit. The port is doing work independent of this decision.
