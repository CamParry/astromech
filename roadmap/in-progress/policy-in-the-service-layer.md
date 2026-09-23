# Policy in the service layer

Every transport (REST, RPC, the AI tool loop, MCP, the CLI and plugin `ctx`)
enforces the same rules, because the rules live in the service methods rather
than in hand-written REST routes. Found by a read-through of the request paths
on 2026-09-22; the defects below were confirmed against the code.

Ships on the `services` branch with `explicit-app-context.md`, one commit per
workstream.

## Defects this fixes

- [x] **Publish can be escalated.** Only `PUT /entries/:type/:id` and
      `bulk-update` demand the publish permission for `status: 'published'`
      (`publishEscalation` in `transport/http/routes/entries.ts`).
      `POST /entries/:type`, RPC `entries.<type>.create|update`, the tool loop
      and MCP do not, so a role that may create or update but not publish can
      publish.
- [x] **Field-capability 409s are REST-only.** `fieldCapabilitiesDenied`
      (`routes/entries.ts`) refuses `status`/`publishedAt` on a type without
      statuses and `slug` on a type without slugs; `entries/methods/create.ts`
      and `entries/internal/update-batch.ts` accept them.
- [x] **The last-admin guard is REST-only.** It lives in
      `transport/http/routes/users.ts` (`PATCH` and `DELETE /users/:id`), so
      `users.update`/`users.delete` over RPC, the CLI or MCP can demote or delete
      the last admin. The route also re-parses `updateUserSchema`, which
      `bind()` already did.
- [x] **Domain errors answer 500.** `onError` (`transport/http/middleware/errors.ts`)
      maps a hand-kept `instanceof` list that omits `CapabilityError`,
      `PermissionDeniedError`, `UnknownEntryTypeError` and the two
      `Staged*ExistsError`s. REST hides it with per-route catches; RPC does not
      (`/rpc/globals.update {staged:true}` on a global without staging is a 500).
      Every `HTTPException` also gets `INTERNAL_ERROR` whatever its status, and
      `SIGN_UP_CLOSED` (`transport/http/app.ts`) answers outside the error
      envelope with a code missing from `ApiErrorCode`.
- [x] **Cross-type `POST /entries/query` 500s on bad input**: an unmapped
      `ZodError` from `entrySortSchema.parse` and an uncaught `c.req.json()`.
- [x] **Most CLI commands never boot the app.** Only `index:rebuild` and
      `validate` call `createAstromech`; the rest use `transport/cli/config.ts`
      `loadConfig`, so no plugin hooks run (redirects' slug-change hook misses
      `entries:update`), plugin repositories are unmounted, and storage and
      email are unset. `call.ts`, `mcp/index.ts`, `index-rebuild.ts` and
      `validate.ts` also load the config file twice, and MCP regenerates the
      manifest instead of reading `getMethodManifest()`.
- [x] **`users:create` skips the service.** It accepts any role string and
      writes the user and its credential account without a transaction. It is
      the third copy of "user plus credential account", beside `auth/setup.ts`
      and `users/methods/create.ts`.
- [x] **Plugin reads default to the full shape**, via
      `utilities/with-default-shape.ts` and `plugin-runtime.ts`, so the menus
      plugin's public method resolves URLs for unpublished, scheduled and
      trashed entries (`plugins/menus/src/service/menus.ts`). Plugin reads
      default to public; a trusted caller opts in with `full: true`. Menus also
      tries every entry type per node and swallows every error. The catch-all
      is gone; the loop over types stays, since a relationship value carries
      no type and no plugin-facing call looks one up by id.
- [x] **The entries repository hardcodes `'en'`** as its default locale
      (`entries/repository/entries-table.ts`, `registry.ts`,
      `entries/internal/preview.ts`); users, media and globals read the
      configured default.
- [x] **`scopeEntries` has drifted from `scopeMethods`**
      (`policies/scoped-services.ts`): it skips `sessionScoped`/`requireSubject`,
      and `if (resolved.kind !== 'permission') continue` lets an
      `'authenticated'` rule through for an anonymous caller.

## The work

- [x] Move the publish check, the field-capability checks and the last-admin
      guard into the methods (or `scopeEntries` where the check needs the
      role), so every transport inherits them.
- [x] Give domain errors a `status` and `code` and map them once in `onError`;
      delete the route-level `capabilityDenied` copies and the per-route
      catches in `rest-route.ts`, `rpc.ts` and `routes/plugins.ts`. Error bodies
      stay byte-identical for REST.
- [x] Turn the bespoke entry and global routes (`POST /:type`, `PUT /:type/:id`,
      `bulk-update`, `POST /:type/:id/staged`, `POST /globals/:key/staged`) into
      route-table rows once they carry no policy of their own.
- [x] Enforce a method's `requires` capability once in `defineService.bind`,
      and delete the manual `assertCapability` calls in `entries/methods/**`,
      `entries/internal/*-batch.ts` and `globals/methods/**`. The two left in
      `globals.get` and `globals.update` check the `staged` flag, which no
      `requires` can state.
- [x] Express the entries per-type and `full` gate in `entryGate` and scope
      entries with `scopeMethods`; delete `scopeEntries`.
- [x] CLI commands boot through `createAstromech` (except `db:*`) and call
      methods through `callMethod(…, 'trusted')`; one "create credential
      account" helper serves setup, the CLI and `users.create`. The codegen
      commands (`generate:*`, `plugin:generate`), `plugin:purge` and
      `permissions` also only load the config: they need no running
      application, and booting would demand a migrated database and every
      plugin's `requiredEnv`.
- [x] Merge the two plugin-method HTTP routes (`/plugins/:name/:method` and
      `/rpc/plugins.*`) onto one envelope and one set of 401/403 rules; the admin
      uses the first. Both answer a plugin method's raw result through one
      handler; `/rpc` mounts before `requireAuth` so a public plugin method
      needs no session there either, and requires one for every other method
      itself.
- [x] Pass Hono's path params to plugin raw routes, and delete backups'
      hand-rolled URL parsing (`routes/backups.ts`).
- [x] Smaller: replace `accessDenied` in `routes/entries.ts` and
      `routes/globals.ts` with `permissionsFor(role).allowsAccess`; hoist
      `flattenEntryFields` out of the per-row loop in `entries/methods/query.ts`;
      replace `with-default-shape.ts`'s 30 forwarders with a spread (deleted
      instead: with plugin reads public, nothing needs it).
- [ ] Drop the unused `audience.role`. Left for the `field-tree-traversal`
      branch, which is reworking `content/visibility.ts`, where the type lives.
