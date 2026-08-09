# Domain Shape Convergence

`roadmap/completed/entries-module-reshape.md` built `entries/` as the template
all domains are read against. The template was never applied to the other four.

| Domain          | Files | `service.ts` | Shape                                  |
| --------------- | ----- | ------------ | -------------------------------------- |
| `entries`       | 50    | 55           | thin assembler over `operations/**`    |
| `media`         | 14    | 435          | one object literal, logic inline       |
| `users`         | 7     | 234          | one object literal, logic inline       |
| `settings`      | 7     | 139          | one object literal, logic inline       |
| `notifications` | 4     | 72           | one object literal, no contract at all |

Two of the gaps are cosmetic and one is not.

## The notifications gap is functional, not stylistic

`notifications/` has no `methods.ts`. `codegen/method-manifest.ts` builds its
catalogue from `users`, `media`, `settings` and `entries` only, so notifications
has four live HTTP routes and zero manifest presence: no declared permission, no
MCP tool, no CLI reach, invisible to the assistant, and no entry in the OpenAPI
document.

It also has two shape defects that follow from never having been held to the
contract:

- **The service takes positional arguments.** `notificationsService.list(userId)`,
  `dismiss(userId, id)`. Every other service method takes a single parameter
  object — the normalisation the tool dispatcher depends on, since
  `callServiceMethod` passes exactly one argument. Notifications was missed by
  it.
- **Two different shapes share one name.** `NotificationsService` in
  `types/services.ts` declares `list()`, `count()`, `dismiss({ id })`,
  `dismissAll()` with no `userId`, because the transport supplies it. The server
  `notificationsService` object declares `list(userId: string)`. They are not the
  same interface, and the mismatch is why `transport/local/index.ts` stubs all
  four with a `notImplemented` that throws.

The open design question is what a session-scoped method looks like in the
manifest. `routes/notifications.ts` states the model — "no permission contracts;
ownership enforced via userId in every query" — and a contract has no way to say
"this argument comes from the caller's identity, not the caller's input". That is
the thing to design, and it is not notifications-specific: it is the same shape
`users.get`'s self-access exemption needs, and it recurs for any per-user
resource.

## Change

### 1. Design the session-scoped contract

Do this first; steps 2 and 3 are mechanical and this one is not.

- [x] `ServiceMethodContract` takes a `sessionScoped: true` flag. The service
      method takes `{ userId }`; `policies/scoped-services.ts` fills it from
      `getCurrentUser()` and overwrites any caller-supplied value, and the
      contract's `input` schema omits it. The fill sits on the scoped handle
      rather than in the tool dispatcher because the handle is what untrusted
      callers hold directly.
- [x] A trusted transport with no user refuses it with a declared reason.
      `buildDispatch` — the raw path the dev-only MCP server and the CLI use —
      answers `ok: false` with a reason naming the missing user, beside the
      `binaryInput` refusal.
- [x] `decisions/0037-session-scoped-service-methods.md`, with the three
      rejected alternatives: naming the argument (`sessionArgument: 'userId'`),
      one declaration also covering `users.get`'s self-access exemption, and
      leaving notifications out of the manifest.

### 2. Bring notifications up to the contract

- [x] Normalise `notificationsService` to single-parameter-object methods:
      `list({ userId })`, `count({ userId })`, `dismiss({ userId, id })`,
      `dismissAll({ userId })`. `list` returns `Notification[]` rather than rows,
      so it matches its peers and the transports stop each mapping the row
      themselves.
- [x] Add `notifications/methods.ts` declaring the four contracts. All four are
      `sessionScoped` with no permission, which is the model the routes already
      enforced written down.
- [x] Add the catalogue to `codegen/method-manifest.ts` alongside `users`,
      `media` and `settings`, plus `notifications` on `ScopedServices` and
      `CORE_SERVICES` so the manifest entry resolves to a callable service.
- [x] Two names. `NotificationsService` stays the CLIENT's shape (no `userId`,
      every transport fills it); the server object is
      `NotificationsDomainService`, declared in `notifications/service.ts`, which
      names the user each verb acts for. Both docstrings point at the other.
- [x] One error, in `transport/local/notifications.ts`: the Local API now
      implements the four methods for real, reading the request context the way
      the HTTP routes read `c.var.user`, and throws once — naming the missing
      session — when called outside a request.
- [x] `plugins/runtime/notify-access.ts` is the port, typed only from
      `NotifyInput`; `notifications/plugin-access.ts` fills it via
      `wireNotifyAccess()`, called beside `wireEntryAccess()` at all three
      composition sites. `plugin-runtime.ts` is off `NO_UPWARD_EXEMPT` and
      `lint:deps` still passes — verified by re-adding the import and confirming
      `capabilities-no-upward` rejects it by name.

### 3. Apply the entries template to `media`

`media` is the worst offender and the clearest win. `service.ts` is 435 lines
holding all eight verbs inline, six private helpers, and
`collectMediaRelationshipSources` exported from the bottom of a service file.

- [x] Decompose into `media/operations/{query,get,upload,update,delete,replace,used-by}.ts`,
      leaving `service.ts` as the assembler `entries/service.ts` is.
- [x] Move the private helpers (`extOf`, `originalKey`, `resolveMediaUrl`,
      `toMedia`, `storeFile`) into `media/internal/` — `keys.ts`, `to-media.ts`,
      `store-file.ts`, plus `parse.ts` for the zod-to-`ValidationError` adapter
      the service held inline.
- [x] Move `collectMediaRelationshipSources` and `indexMediaRelationships` out of
      the service file — they are relationship-index concerns with a
      `boot/relationship-index.ts` consumer, not media verbs. They live in
      `media/internal/relationships.ts`, where `entries` keeps its pair.
- [x] **No `media/visibility.ts` — media has no shape axis to express.**
      `roadmap/completed/content-visibility.md` scopes the public/full split to
      entries and settings, and `utilities/with-default-shape.ts` names those two
      as "the domain that carries a shape axis" and "the other" one. Media's own
      `public`/`private` config key is `MediaAccess`, a DELIVERY policy (driver
      URL vs proxying route) that `types/config.ts` documents as "NOT access
      control today" — nothing projects a media row into two shapes, so there is
      no per-call-site decision to centralise and a `visibility.ts` here would be
      a new feature, not a relocation.

### 4. Apply it to `users` and `settings`, or decide not to

**Decision: `users` follows the template; `settings` and `notifications` do not.**

The test is two clauses, and both do work. A domain decomposes when it has **more
than three verbs** AND **at least one verb whose body carries policy rather than
a storage call**. `entries` (18 verbs), `media` (7) and `users` (5) pass.
`settings` fails the first — `set` and `get` are genuinely policy, but with three
verbs `service.ts` fits on two screens and is its own index, so splitting buys a
hop and no findability. `notifications` fails the second — four verbs, every body
a single storage call, so `operations/count.ts` would hold a one-line function.

Line count is what this file offered, and it is the wrong axis: `users` at 234
lines has the same profile as `media` at 435, two field-pipeline verbs and three
storage wrappers. It also had the identical defect step 3 fixed —
`collectUserRelationshipSources` exported from the bottom of the service file
with a `boot/relationship-index.ts` consumer. Leaving it would have meant boot
importing one collector from an `internal/relationships.ts` and the other from a
`service.ts`, which is drift a reader has to explain.

Annotating `usersService: UsersService` — free once the assembler exists —
surfaced another instance of the sweep's pattern: `UsersService` declared neither
`create`'s nor `update`'s `roleSlug`, though the schema, the contract, the routes
and the service all carry it. Fixed.

- [x] `users` decomposed into `operations/{query,get,create,update,delete}.ts`
      and `internal/{parse,to-user,relationships}.ts`, with `service.ts` as the
      assembler. `settings` and `notifications` stay one file each.
- [x] `ARCHITECTURE.md`'s invariant now separates the three files every domain
      owns (`service.ts`, `schema.ts`, `methods.ts`) from the two that are
      per-domain (`visibility.ts` where a domain has more than one shape;
      `operations/` + `internal/` where one file stopped being readable), and
      names which domains have which. The directory map matches.

## Notes / caveats

- **Step 1 blocks step 2 and nothing else.** Step 3 is independent and can land
  first if the media decomposition is the more useful unblock.
- **Step 3 is behaviour-preserving.** `tests/services/media/` has seven files and
  is the safety net; run it before and after with no edits to it.
- **The sweep found three more.** Notifications is the domain
  `roadmap/planned/module-boundary-enforcement.md` found absent from every
  dependency-cruiser rule, and the manifest gap has the same cause. Every place
  that hand-enumerates the domains was checked; three more had skipped it, all
  now fixed here: `ScopedServices` and `scopedServices()` in
  `policies/scoped-services.ts` (four domains, so a role-scoped caller could
  reach nothing), `CORE_SERVICES` in `transport/tools/dispatch.ts` (so a manifest
  entry would have resolved to "no service registered for domain"), and the
  invariant list in `ARCHITECTURE.md`.

    Three enumerations omit it correctly and were left alone: `CORE_PERMISSIONS`
    (a session-scoped method declares none by design), `AIContextKind` (there is no
    notifications admin page — it is a bell dropdown), and the relationship-index
    collectors in `boot/relationship-index.ts` (notifications carries no fields, so
    it is not a relationship source).

    Two more instances of the same PATTERN — a declaration that drifted from the
    code it describes — turned up outside notifications. `UsersService` declared
    neither `create`'s nor `update`'s `roleSlug`, hidden because `usersService`
    carried no type annotation (fixed in step 4). And `apps/docs/cli.md`'s MCP
    coverage list did not say why a method is omitted from the tool surface (fixed
    in step 2).

- **What manifest presence did and did not buy notifications.** It gets a CLI
  listing (`astromech methods` shows all four), assistant tool visibility
  (`buildScopedTools` builds them, and the scoped handle supplies the subject),
  and a Local API that works. It gets **no MCP tool** — that transport is
  trusted, dev-only and runs with no signed-in user, so it refuses a
  session-scoped method the way it refuses `binaryInput` — and **no permission**,
  which is the design: having a session is the authority. It also gets **no
  OpenAPI entry**, but that is not a notifications gap: `transport/http/index.ts`
  builds the document from `createRoute` registrations, and only
  `routes/entries.ts` uses them, so `media`, `users`, `settings`, `cron` and
  `plugins` are equally absent.
- `roadmap/planned/notification-events.md` is the emitter backlog and is
  unaffected by this; it wires `notify()` call sites, which is the one part of
  the domain that does have a coherent surface.
- No stored-data change. `db:generate` must still report no schema changes.
