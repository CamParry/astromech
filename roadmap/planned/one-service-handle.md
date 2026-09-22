# One service handle

The object of services a caller holds is built by one function, so binding,
scope, default shape and the typed facades are decided once. After tRPC's
`createCaller(ctx)` and Payload's Local API, where access and shape are
arguments on one object.

## Why

The handle is assembled in about seven places: the `AppContext` getters,
`bindCurrent`, `scopedServices`/`scopeEntries`, `trustedServices`, the plugin
context with `withDefaultShape`, the HTTP client, and 13 admin route and hook
files. Each decides binding, scope, shape and typing itself, which produced the
three permission wrappers, the `scopeEntries` drift and plugin reads defaulting
to the full shape. Each also casts with `as unknown as`, because
`EntriesMethods` collapses the `EntriesService` overloads.
`explicit-app-context.md` settles binding and scope; typing and default shape
remain.

## The work

- [ ] `createServices(ctx, { shape })` in `app-context/` builds every handle:
      the `AppContext` getters, `scopedServices(ctx)`, trusted calls, plugin
      `ctx` (plugin reads default to public), `bindCurrent` and
      `rest-route.ts`. The typed facades are applied in that one file.
- [ ] Try declaring the entries definition against `EntriesService` so `bind`
      needs no cast. If the overloads defeat `MethodsFor`, keep one cast in
      `entries/service.ts` and say why.
- [ ] `astromech/fetch` exports untyped services for the admin; delete `api`
      from the entry and global bindings, and the 13 casts. **Public API**
      (additive).
- [ ] One typed `Link` (`rendering/cells/link.ts`) for `entry-edit-page.tsx`,
      `global-edit-page.tsx` and `version-history.tsx`.
- [ ] Record in the `code` skill that `defineService` returns
      `ServiceDefinition` because `XService` is the bound interface.
- [ ] Guard: `no-restricted-syntax` refusing `as unknown as` outside an
      allowlist (`database/codec.ts`, `database/drivers/**`,
      `database/repository/create-repository.ts`,
      `content/repository/content-table.ts`, `services/json.ts`,
      `auth/better-auth.ts`, the facade file).

Depends on `explicit-app-context.md` and `remove-settings-module.md`.
