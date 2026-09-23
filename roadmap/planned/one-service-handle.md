# One service handle

The object of services a caller holds is built by one function, so binding,
scope and the typed facades are decided once. After tRPC's `createCaller(ctx)`
and Payload's Local API, where access is an argument on one call
(`overrideAccess`).

## Why

The handle is assembled in seven places: the `AppContext` getters,
`bindCurrent`, `scopedServices`, `trustedServices` (`policies/call-method.ts`),
the plugin context, `createAstromech`'s return value and the HTTP client, plus
nine admin route and hook files that cast the client's entries back to the
wide type. Each decides binding, scope and typing itself. It left eight
`as unknown as` casts on the handle in core (`app-context.ts`, `services.ts`
twice for `bindCurrent` and twice for the facades, `plugin-runtime.ts`,
`rest-route.ts`, `client.ts` twice) and nine in the admin, because
`EntriesMethods` collapses the `EntriesService` overloads.
`explicit-app-context.md` and `policy-in-the-service-layer.md` settled binding,
scope and the public default shape; typing remains.

Checked against the code on 2026-09-23: the default shape is already settled
(every read defaults to public, a trusted caller passes `full: true`), so the
function takes no `shape` option.

## The plan

- `Services` (`types/services.ts`): every content service plus `plugins`.
  `TypedServices` is the same with `entries` and `globals` under their facades.
- `createServices(ctx, { overrideAccess })` in `app-context/services.ts`
  builds a handle bound to `ctx`, cached per context. The default is trusted,
  as Payload's Local API; `overrideAccess: false` wraps each method in the
  role check (`scopeMethods`, `scopePlugins` in `policies/scoped-services.ts`).
  `currentServices` in the same file is the trusted handle for a caller that
  holds no context: each call resolves `currentAppContext()` and calls
  `createServices` on it.
- Callers: the `AppContext` getters, the plugin `ctx` layer, `callMethod`
  (trusted: `currentServices`; scoped: `overrideAccess: false`),
  `rest-route.ts`, the plugin RPC route and `createAstromech` all read
  `createServices` or `currentServices`. `scopedServices`, `trustedServices`,
  `bindCurrent`, `pluginServices` and the per-domain `*Service` exports go.
- `typedServices(services)` (`services/typed-services.ts`, browser-safe) holds
  the one facade cast; `createAstromech`, the plugin `ctx` and
  `astromechClient` apply it.

## The work

- [x] `createServices(ctx, { overrideAccess })` in `app-context/` builds every
      handle: the `AppContext` getters, the scoped handle, trusted calls,
      plugin `ctx`, `currentServices` and `rest-route.ts`. The typed facades
      are applied in one file. **Public API**: `astromech/methods` exports
      `createServices` in place of `scopedServices`.
- [x] Declare the entries definition against `EntriesService` so `bind` needs
      no cast: each of the five one-or-many methods ends with a union
      signature, which `MethodsFor` reads. `EntriesMethods` goes.
- [x] `astromech/fetch` exports `astromechUntypedClient` for the admin; delete
      `api` from the entry and global bindings and hook scopes, and the nine
      casts. The admin uses it for every call, so it holds one client.
      **Public API** (additive).
- [ ] One typed `Link` (`rendering/cells/link.ts`) for `entry-edit-page.tsx`,
      `global-edit-page.tsx` and `version-history.tsx`.
- [ ] Record in the `code` skill that `defineService` returns
      `ServiceDefinition` because `XService` is the bound interface.
- [ ] Guard: the drift report's `as unknown as` count falls to the files that
      need one (the database codec and drivers, the repository factories,
      `services/json.ts`, `auth/better-auth.ts`, the facade file).

Depends on `explicit-app-context.md` and `remove-settings-module.md`.
