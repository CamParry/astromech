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

- [ ] `users/service.ts` (234 lines) and `settings/service.ts` (139) are below
      the size where decomposition obviously pays. Decide once, explicitly:
      either they follow the template for uniformity, or the template applies
      above a stated threshold and this file records the threshold.
- [ ] Whichever way it goes, say so in `ARCHITECTURE.md` — the invariant list
      currently implies every domain owns `service.ts`, `schema.ts`, `methods.ts`
      and `visibility.ts`, and three domains do not.

## Notes / caveats

- **Step 1 blocks step 2 and nothing else.** Step 3 is independent and can land
  first if the media decomposition is the more useful unblock.
- **Step 3 is behaviour-preserving.** `tests/services/media/` has seven files and
  is the safety net; run it before and after with no edits to it.
- Notifications is the domain `roadmap/planned/module-boundary-enforcement.md`
  found absent from every dependency-cruiser rule. The two gaps have the same
  cause — it was added after the conventions were set and never held to them —
  and finding a third would not be surprising. Worth a deliberate sweep for
  anything else that skipped it.
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
