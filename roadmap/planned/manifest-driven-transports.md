# Manifest-Driven Transports

The method manifest already describes every service method completely: id, Zod
input schema, output schema, permission rule, and the `mutates` /
`destructive` / `idempotent` effect triple. `transport/tools/dispatch.ts` turns
any manifest entry into a callable tool with no per-domain adapter and no switch
over method names, which is how the MCP server and the AI tool-loop reach the
whole service surface for free.

Three transports do not read it, and hand-restate the same facts instead:

| Transport                                               | Lines | Derived from the manifest          |
| ------------------------------------------------------- | ----- | ---------------------------------- |
| `packages/astromech/src/transport/tools/dispatch.ts`    | 357   | entirely                           |
| `packages/astromech/src/transport/http/routes/`         | 1836  | no — 47 hand-written verb handlers |
| `packages/astromech/src/transport/http/client/index.ts` | 862   | no — 48 hand-written URL mappings  |
| `packages/astromech/src/transport/cli/commands/`        | ~500  | no, except `methods.ts`            |

`dispatch.ts` already records what this costs, in its own header: the adapters it
replaced were second declarations of methods that described themselves, and the
second declaration is what drifted — `users_update` advertised a hand-written
schema that rejected custom user fields for months. The lesson was applied to two
transports and not to the other three.

The concrete exposure today is that nothing checks `routes/entries.ts` and
`client/index.ts` against each other or against the contracts they both restate.
`routes/entries.ts` is 1137 lines, over 60% of the HTTP surface, and it
hand-parses query params (`parseQueryParams`, `validateSort` with its own
`SORTABLE_FIELDS` set), builds a `ServiceMethodContract` inline to reach
`permissionsFor`, and hand-shapes every response envelope — while
`packages/astromech/src/entries/methods.ts` declares the real schemas for exactly
those methods a few directories away. Service tests never mount the routers, so a
route that drops a key passes the entire gate.

A related symptom, same root: `OpenAPIHono` is imported by every route file and
`createRoute()` is called five times against 25 raw `router.get`/`router.post`
calls in `routes/entries.ts` alone. The OpenAPI document at `/openapi.json`
therefore describes a small fraction of the API.

## Permission enforcement is part of the same problem

Whether a call is permission-checked currently depends on which transport it
arrived through:

- `transport/local` composes no wrapper (documented as trusted).
- HTTP routes call `permissionsFor(...).allowsMethod` per handler, against a
  contract built at the call site.
- `buildDispatch` carries `permission` and explicitly does not enforce it.
- `buildScopedDispatch` enforces through `policies/scoped-services.ts`.

Each is individually justified. Collectively there is no single answer to "is
this method gated", and the count scales with transports times domains as the
adapters in `roadmap/planned/multi-runtime-and-framework-adapters.md` land.

`policies/scoped-services.ts` states the constraint this work has to respect:
`permissionsFor` stays the seam for checks carrying logic a contract cannot
state — `users.get` allowing self-access without `users:read`, the last-admin
guard. The target is not one mechanism, it is one mechanism plus an enumerated
exception list.

## Change

### 0. Enumerate what cannot be generic

Before anything is collapsed, write down which handlers are genuinely bespoke and
why. Expected members, to be confirmed rather than assumed: `media.upload` and
`media.replace` (`binaryInput`), media serving, the auth routes, `/setup/check`,
the cron poke, the plugin RPC route, notifications (session-scoped — see
`roadmap/completed/domain-shape-convergence.md`), `users.get` self-access, and the
last-admin guard.

- [x] List every handler in `transport/http/routes/` with the reason it is or is
      not expressible as `(verb, path, method id, argument mapping)`.
- [x] Record the count that survives. It is the honest measure of what this work
      saves, and it is the number to check the result against.

#### What "generic" means here

A handler counts as generic when it is fully described by `(verb, path, method
id, args, success status, envelope)`, where `envelope` is one of a closed set —
`{ data }`, `{ success: true }`, `204`, raw — plus four preconditions the table
reads from the manifest rather than restating:

1. entry type does not resolve → `404`,
2. the contract's `requires` capability is unmet → the `capability_not_supported`
   `409`,
3. the method returned `null` → `404`,
4. a per-domain map from a declared domain error to a status.

Everything else is bespoke: a permission check no contract can state, a
capability check no contract declares, a method id chosen at request time, a
non-JSON body, a response shape outside the closed set, or a handler with no
manifest method behind it at all.

#### The count

| Scope                        | Handlers | Generic | Bespoke |
| ---------------------------- | -------: | ------: | ------: |
| `routes/entries.ts`          |       30 |      24 |       6 |
| `routes/users.ts`            |        5 |       2 |       3 |
| `routes/media.ts`            |        7 |       4 |       3 |
| `routes/settings.ts`         |        3 |       2 |       1 |
| `routes/entry-types.ts`      |        2 |       0 |       2 |
| `routes/notifications.ts`    |        4 |       3 |       1 |
| `routes/plugins.ts`          |        2 |       0 |       2 |
| `routes/cron.ts`             |        1 |       0 |       1 |
| **`transport/http/routes/`** |   **54** |  **35** |  **19** |
| `transport/http/index.ts`    |        2 |       0 |       2 |
| **Whole Hono app**           |   **56** |  **35** |  **21** |

**21 bespoke handlers survive**, and 35 collapse into the table. That is the
number to check the result against.

`src/routes/media-handler.ts` (media serving) and `src/routes/auth-handler.ts`
(Better Auth) are Astro `APIRoute`s outside the Hono app, so they are not
candidates for the table at all — they are named here only because the paragraph
above expected them in the bespoke set.

#### `routes/entries.ts` — 30 handlers

| Verb + path                                   | Method id                        | Generic | Reason                                                                                                                                                         |
| --------------------------------------------- | -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /query`                                 | `entries.query`                  | no      | `type` arrives in the body and may be a list; absent → a hand-rolled `invalid_input` 400 outside `ApiErrorCode`                                                |
| `GET /:type`                                  | `entries.query`                  | yes     | args are the query string                                                                                                                                      |
| `GET /:type/:id`                              | `entries.get`                    | yes     | null → 404                                                                                                                                                     |
| `POST /:type`                                 | `entries.create`                 | no      | per-FIELD capability 409: `status`/`publishAt` need `statuses`, `slug` needs `slug` — no contract states this                                                  |
| `POST /:type/query`                           | `entries.query`                  | yes     | args are the body                                                                                                                                              |
| `POST /:type/bulk-update`                     | `entries.update`                 | no      | per-field capability 409, plus `status: 'published'` demanding the `publish` permission on an `update` method                                                  |
| `POST /:type/bulk-trash`                      | `entries.trash`                  | yes     | `requires: 'trash'`                                                                                                                                            |
| `POST /:type/bulk-delete`                     | `entries.delete`                 | yes     |                                                                                                                                                                |
| `POST /:type/bulk-restore`                    | `entries.restore`                | yes     | `requires: 'trash'`                                                                                                                                            |
| `POST /:type/bulk-publish`                    | `entries.publish`                | yes     | `requires: 'statuses'`                                                                                                                                         |
| `POST /:type/bulk-unpublish`                  | `entries.unpublish`              | yes     | `requires: 'statuses'`                                                                                                                                         |
| `POST /:type/bulk-schedule`                   | `entries.schedule`               | yes     | `requires: 'statuses'`                                                                                                                                         |
| `POST /:type/:id/restore`                     | `entries.restore`                | yes     | `requires: 'trash'`                                                                                                                                            |
| `POST /:type/:id/duplicate`                   | `entries.duplicate`              | yes     | absent body → `{}` is an args concern                                                                                                                          |
| `PUT /:type/:id`                              | `entries.update`                 | no      | per-field capability 409, plus the same publish escalation                                                                                                     |
| `DELETE /:type/trash`                         | `entries.emptyTrash`             | yes     | `requires: 'trash'`                                                                                                                                            |
| `DELETE /:type/:id/force`                     | `entries.delete`                 | yes     |                                                                                                                                                                |
| `DELETE /:type/:id`                           | `entries.trash` **or** `.delete` | no      | the method id is chosen at request time from the type's `trash` capability                                                                                     |
| `POST /:type/:id/publish`                     | `entries.publish`                | yes     | `requires: 'statuses'`                                                                                                                                         |
| `POST /:type/:id/unpublish`                   | `entries.unpublish`              | yes     | `requires: 'statuses'`                                                                                                                                         |
| `POST /:type/:id/schedule`                    | `entries.schedule`               | yes     | `requires: 'statuses'`                                                                                                                                         |
| `GET /:type/:id/versions`                     | `entries.versions`               | yes     | the contract declares `requires: 'versioning'` and the route does not check it — honouring it ADDS a 409                                                       |
| `POST /:type/:id/versions/:versionId/restore` | `entries.restoreVersion`         | yes     | same unchecked `requires: 'versioning'`                                                                                                                        |
| `GET /:type/:id/incoming-relationships`       | `entries.incomingRelationships`  | yes     |                                                                                                                                                                |
| `POST /:type/:id/staged`                      | `entries.createStaged`           | no      | `StagedEntryExistsError` → a 409 carrying `details.stagedId`, and a catch-all that turns every other throw into a 500 instead of letting `onError` classify it |
| `GET /:type/:id/staged`                       | `entries.getStaged`              | yes     | `requires: 'staging'`; returns `{ data: null }`, not a 404                                                                                                     |
| `POST /:type/:id/staged/merge`                | `entries.mergeStaged`            | yes     | `requires: 'staging'`                                                                                                                                          |
| `DELETE /:type/:id/staged`                    | `entries.deleteStaged`           | yes     | `requires: 'staging'`                                                                                                                                          |
| `POST /:type/:id/preview-token`               | `entries.issuePreviewToken`      | yes     | `requires: 'staging'`; absent body → no TTL                                                                                                                    |
| `DELETE /:type/:id/preview-token`             | `entries.revokePreviewToken`     | yes     | `requires: 'staging'`                                                                                                                                          |

The `PublicTrashedReadError` → 400 shared by the three query routes is the
per-domain error map, not per-route code, so it does not make them bespoke.

#### `routes/users.ts` — 5 handlers

| Verb + path   | Method id      | Generic | Reason                                                                                                           |
| ------------- | -------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /`       | `users.query`  | yes     |                                                                                                                  |
| `GET /:id`    | `users.get`    | no      | self-access: `currentUser.id === id` passes without `users:read`                                                 |
| `POST /`      | `users.create` | yes     | 201                                                                                                              |
| `PUT /:id`    | `users.update` | no      | self-access, `roleSlug` changes still demanding `users:update`, and the last-admin guard (a second storage call) |
| `DELETE /:id` | `users.delete` | no      | the last-admin guard                                                                                             |

#### `routes/media.ts` — 7 handlers

| Verb + path         | Method id       | Generic | Reason                                                                                     |
| ------------------- | --------------- | ------- | ------------------------------------------------------------------------------------------ |
| `GET /`             | `media.query`   | yes     | `mimeType` maps into `where`                                                               |
| `GET /:id`          | `media.get`     | yes     | null → 404                                                                                 |
| `GET /:id/usage`    | `media.usedBy`  | no      | pre-flights `media.get` to turn an unknown id into a 404 — two method calls in one handler |
| `POST /upload`      | `media.upload`  | no      | `binaryInput`: multipart body, `File` has no JSON representation                           |
| `POST /:id/replace` | `media.replace` | no      | `binaryInput`, plus the same `media.get` pre-flight                                        |
| `PUT /:id`          | `media.update`  | yes     |                                                                                            |
| `DELETE /:id`       | `media.delete`  | yes     |                                                                                            |

#### `routes/settings.ts` — 3 handlers

| Verb + path | Method id      | Generic | Reason                                                                                                 |
| ----------- | -------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `GET /`     | `settings.all` | yes     | args pin `full: true`                                                                                  |
| `GET /:key` | `settings.get` | no      | the method returns the value alone; the route re-attaches the path param as `{ data: { key, value } }` |
| `PUT /:key` | `settings.set` | yes     | args merge the path key with the body value                                                            |

#### `routes/entry-types.ts` — 2 handlers

Neither has a service method or a contract behind it. Both read
`Astromech.config` directly, project a metadata shape, and are reachable by any
authenticated caller with no permission check at all.

| Verb + path  | Generic | Reason                                                                                                                            |
| ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`      | no      | no method id; returns a bare array with no envelope                                                                               |
| `GET /:type` | no      | no method id; resolves only ROOT types via `config.entries[type]`, so a plugin entry type 404s here while it serves on `/entries` |

#### `routes/notifications.ts` — 4 handlers

The roadmap expected all four to be bespoke. Since
`decisions/0037-session-scoped-service-methods.md` landed, three are not:
`scopedServices` fills `userId` from the request context for a `sessionScoped`
contract, which is exactly what these handlers do by hand.

| Verb + path   | Method id                  | Generic | Reason                                                                   |
| ------------- | -------------------------- | ------- | ------------------------------------------------------------------------ |
| `GET /`       | `notifications.list`       | yes     | `sessionScoped`                                                          |
| `GET /count`  | `notifications.count`      | no      | the method returns a scalar; the route wraps it as `{ data: { count } }` |
| `DELETE /`    | `notifications.dismissAll` | yes     | 204                                                                      |
| `DELETE /:id` | `notifications.dismiss`    | yes     | 204                                                                      |

#### `routes/plugins.ts` — 2 handlers

| Handler                                      | Generic | Reason                                                                                                                                                                                   |
| -------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the raw-route loop (`pluginsRouter.on(...)`) | no      | verb and path are plugin-declared, the handler takes a Web `Request`, and access is `PluginAccess`                                                                                       |
| `POST /:name/:method`                        | no      | the method id is two path params resolved at request time against the plugin service registry; `PluginAccess`, not a contract permission; the raw handler result is returned unenveloped |

#### `routes/cron.ts` — 1 handler

| Verb + path | Generic | Reason                                                                                           |
| ----------- | ------- | ------------------------------------------------------------------------------------------------ |
| `POST /run` | no      | no service method; its own auth (bearer secret OR admin session), mounted ahead of `requireAuth` |

#### `transport/http/index.ts` — 2 handlers

| Verb + path        | Generic | Reason                                                                                          |
| ------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| `GET /setup/check` | no      | unauthenticated by design, and deliberately calls `users.query` (a `users:read` method) ungated |
| `GET /me`          | no      | no service method — it returns `c.var.user` and `c.var.role`                                    |

#### Against the roadmap's expected list

Confirmed: `media.upload` / `media.replace`, `/setup/check`, the cron poke, the
plugin RPC route, `users.get` self-access, the last-admin guard.

Not applicable: media serving and the auth routes are Astro `APIRoute`s, not
Hono handlers.

Refuted: notifications, three quarters of it. Only `count` is bespoke, and only
because of its response shape.

Unanticipated: the per-field capability 409s on create/update/bulk-update, the
`status: 'published'` publish escalation, `DELETE /:type/:id` picking its method
id from a capability, `POST /entries/query`'s `invalid_input` 400, the staged
409, both `entry-types` handlers, `media.usedBy`'s pre-flight, `settings.get`
re-attaching the key, `notifications.count`'s wrapper, the plugin raw-route loop,
and `GET /me`.

### 1. An RPC route over the manifest

Additive and independently verifiable, so it lands first and proves the seam
before any existing route is touched.

- [x] `POST {apiRoute}/rpc/:id` — resolve the manifest method by id from
      `codegen/manifest-registry.ts`, build via `buildScopedDispatch(method, role)`,
      validate the body against the contract's input schema, invoke, return the
      envelope.
- [x] Refuse with the dispatcher's own `DispatchResult.reason` when the method is
      not callable, so a `binaryInput` method fails with the reason it declares
      rather than a generic 400.
- [x] Mount after `requireAuth`, so the role is present.
- [x] Test it the way `tests/transport/mcp/parity.test.ts` tests the MCP
      projection: assert every manifest method is either reachable or refused
      with a declared reason, with no third outcome.

This alone gives an HTTP surface to methods that have none today, and gives the
assistant and any future remote transport one enforced path in.

### 2. A declarative REST route table

The REST surface stays — it is the documented public API and the shape the admin
speaks. What changes is that a route declares itself instead of implementing
itself.

```ts
const ENTRIES_ROUTES: RestRoute[] = [
    { verb: 'get', path: '/:type', id: 'entries.query', args: queryArgs },
    { verb: 'post', path: '/:type', id: 'entries.create', args: bodyWithType },
    // …
];
```

One generic handler reads the table: resolve the manifest method, map the request
to the method's argument object, validate against the contract schema, dispatch
through `scopedServices`, wrap the envelope. The only bespoke code left per route
is the `args` function, which is the one genuinely per-route fact (how path
params and query string become the argument object).

- [x] Define `RestRoute` and the generic handler in `transport/http/routes/`.
- [x] Convert one domain first. `settings` (76 lines, 3 handlers) is the
      smallest honest test; `entries` is the payoff and goes last.
- [x] Delete `parseQueryParams` / `validateSort` / `SORTABLE_FIELDS` from
      `routes/entries.ts` in favour of the contract's own schema, and move any
      sortable-field constraint into `entries/schema.ts` where the rest of the
      entry contract lives.
- [x] Bespoke handlers from step 0 stay as explicit entries below the table,
      each carrying the reason it is not in it.
- [x] Emit the OpenAPI document from the table plus the contracts, replacing the
      five hand-written `createRoute()` calls. This is the point at which
      `/openapi.json` starts describing the whole API.

Every domain is converted: 35 handlers in a table and 21 bespoke, exactly the
split step 0 predicted. `routes/entries.ts` went from 1137 lines to 756, and
`transport/http/routes/` from 2009 to 1783. `/openapi.json` is emitted from the
table rather than hand-written.

A bespoke handler is still public API, so a row of the table may declare a
route's path and schema without also naming a generic handler for it: the row
carries `handler: 'bespoke'`, `documentBespokeRoutes` puts it in the document,
and the handler stays hand-written. Twelve of the 21 bespoke handlers are
documented that way — every one with a method contract behind it. The nine that
are not are the two multipart media routes (a `File` has no JSON schema) and the
seven handlers with no service method at all: both `entry-types` routes, both
plugin routes, the cron poke, `/setup/check` and `/me`.

The bulk routes report a validation failure under `ids`, the name the caller
sent, rather than `id`, the method's argument — declared once as `wireNames` on
the row and read by the document and the error path alike.

### 3. Generate the fetch client from the same table

Once a route declares `(verb, path, method id)`, the client has no independent
facts left to hold. `client/index.ts` becomes a proxy: look up the route for the
method id, build the URL, fetch, unwrap.

- [x] Move the route table into a pure data module both halves import. This is
      the `*.shared.ts` convention from
      `roadmap/completed/module-boundary-enforcement.md` step 2 — the table names
      no service and imports no config, so it is browser-safe by construction.
- [x] Rebuild `astromechClient` as a proxy over the table, keeping
      `AstromechApiError`, `emitApiError` and the `configure({ baseUrl })`
      surface unchanged.
- [x] Keep the hand-written methods for the bespoke routes (media upload is
      `FormData`, not JSON) and nothing else.
- [x] The client's static types keep coming from `AstromechClient`, so admin call
      sites do not change and a wrong proxy fails the typecheck.

The alternative — generating a client file at build time via `codegen/` — is
worth naming and rejecting explicitly: it adds a generated artifact to review
and a build ordering constraint, and buys nothing a proxy over shared data does
not already give.

The table is `packages/astromech/src/transport/http/routes/http-routes.shared.ts`,
beside the routes it describes. `client-is-over-the-wire` reads the `*.shared.ts`
marker, the same allowance the admin has, rather than carrying a path exemption
for the table.

`client/index.ts` went from 862 lines to 511. Of the 40 methods on
`AstromechClient`, 31 are the bare proxy and 7 more resolve their route from the
table with a client-side wrapper the row cannot describe: the admin's full-shape
default (`entries.query`, `entries.get`), a query string the service params do
not match one-to-one (`media.query`, `users.query`), a flag with no wire form
(`settings.all`), a 404 that means "no value" plus the per-locale merge
(`settings.get`), and a scalar behind a wrapper object (`notifications.count`).
Two are written out end to end — `media.upload` and `media.replace`, whose body
is `FormData`.

`tests/transport/http/client/methods.test.ts` asserts the URL, verb, body and
unwrapped result of every one of them, since a proxy that returns the wrong
envelope type-checks fine and the admin is what would break.

### 4. A generic CLI call path

- [x] Add `astromech call <method-id> --args <json|@file>` on top of
      `buildDispatch`, alongside the existing `astromech methods`.
- [x] Decide per command whether the hand-written `entries:*` / `users:*`
      commands stay as ergonomic aliases over `call` or are retired. Their flag
      parsing is the only thing they hold that `call` does not, and for
      `entries:create` that is `--fields @file`, which is worth keeping.

All eleven stay, unchanged and not rewritten over `call`. They restate nothing:
no schema, no permission, no URL, no envelope — so there is no second
declaration to drift, which is the defect the rest of this work removes. What
they hold is a flag surface `call` cannot offer, and it is larger than
`--fields @file`: `entries:create` and `entries:update` coerce `--publishAt`
into a `Date` that JSON has no form for, and `users:create` prompts for a
password and writes the Better Auth credential row beside the user, which
`users.create` does not do at all. Rewriting them as aliases would keep every
`args` block and replace a three-line body with an indirection.

`call` validates against the contract's input schema before invoking, the way
`POST /rpc/:id` does, and a method the dispatcher refuses reports the reason it
declared — `binaryInput`, `sessionScoped`, or no input schema.

### 5. Close the enforcement question

- [x] Every route reached through the generic handler is enforced by
      `scopedServices`, so its handler contains no permission code at all.
- [x] The exception list from step 0 keeps its explicit `permissionsFor` check,
      and each one carries a comment naming the logic the contract cannot state.
- [x] `ARCHITECTURE.md` gains a sentence stating which transports enforce and
      which are trusted, since that fact currently has to be reconstructed from
      four files.

`mountRestRoutes` dispatches all 35 table routes through `scopedServices`, and
in eleven of them — users, media, settings and notifications — no handler
function names a permission at all. The 24 entries rows share
`entryPrecondition`, which still reads `entryPermission(type, action)`, and it
is the one residue the caveats below predicted: `scopedServices` refuses the
call whatever it returns, so what that read decides is the ORDER — an unknown
type answers 403 to an under-privileged role and 404 to a privileged one. No
contract can stand in for it, because an unresolved entry type has none. The
comment on it now says that rather than reading as the gate.

All 21 bespoke handlers carry their reason. Sixteen already did; the five added
here are the two plugin routes, the cron poke, `/setup/check` and `/me`, which
had the reason in a file header rather than against the handler.

## Notes / caveats

- **Steps are independently landable and should land separately.** Step 1 is
  additive. Step 2 is a per-domain conversion. Step 3 cannot start before step 2
  produces the table.
- **This is behaviour-preserving for every route it touches**, which means the
  existing route tests are the safety net and should be extended _before_ the
  conversion, not after. `tests/transport/http/routes/` covers 8 files against
  1836 lines of routes; the conversion is the moment to fix that ratio, and
  doing it first is what makes the conversion verifiable at all.
- **Browser-verify the admin after step 3.** The admin is the fetch client's only
  real consumer, and a proxy that returns the wrong envelope shape typechecks
  fine. `apps/demo` on port 4323 is the check.
- **`entryGate` is confirmed duplicated logic**, not a special case.
  `permissionsFor(...).allowsMethod` reads only `contract.permission`, so
  `entryGate`'s `mutates` and `destructive` fields are dead on arrival and the
  whole call reduces to `permissions.allows(entryPermission(type, action))` —
  which is character-for-character what `scopeEntries` runs per targeted type.
  The `entry:read:full` check the routes make is duplicated too:
  `scopeEntries`'s `wantsFullShape` already enforces it. Every route's hand-picked
  action also agrees with `ENTRY_METHOD_ACTIONS` for the method it dispatches, all
  30 of them, so nothing is lost by deriving it. Two residues are NOT covered and
  must stay: the `status: 'published'` publish escalation on `update` /
  `bulk-update`, and the ordering — 29 of the 30 routes check the permission
  BEFORE the type exists, so an unknown type answers 403 to an under-privileged
  role and 404 to a privileged one. `POST /entries/query` is the odd one out and
  checks type existence first, so it answers 404 either way.
- No migration, no stored-data change, no public API change if done correctly —
  the URL surface is preserved by the table.
