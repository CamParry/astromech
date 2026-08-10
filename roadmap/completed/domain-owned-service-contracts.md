# Domain-Owned Service Contracts

Step 1 (move `AstromechClient` to `transport/`) landed. Step 2 (move the five
domain service contracts to their domains) is decided-against. Step 3 (narrow the
barrel) was decided-against earlier.

`decisions/0039-a-contract-lives-with-the-layer-that-implements-it.md` has the
reasoning for step 1 and the measurement that stopped step 2.
`decisions/0042-domain-contracts-stay-centralised-in-the-leaf.md` closes step 2:
the principle does not transfer from `AstromechClient` to the domain contracts,
and centralised contracts are the correct position for this codebase's
architecture.

## What landed

- [x] `AstromechClient` moved to `transport/astromech-client.shared.ts`, beside
      its two implementations. `plugins/runtime/client-access.ts` declares the
      narrower slice the capability layer needs, typed from leaves.
- [x] `types/index.ts` keeps `export *`. Narrowing it does not deliver interface
      segregation (TypeScript invalidates by module, not named export), and deep
      imports would be churn nothing enforces.
- [x] Step 2 decided-against. The five service contracts stay in
      `types/services.ts`. See 0042 for the full reasoning.

## Remaining cleanup

The query primitives (`AllLocales`, `SortDirection`, `SortOption`,
`ReferencesFilter`, `WhereFilters`, `QueryOptions`, `QueryResult`) split from
`types/services.ts` into `types/query.ts`. They are shared vocabulary over the
data model, not contracts of any domain, and the 377-line file is doing two jobs.
The barrel re-exports both; no consumer changes.
