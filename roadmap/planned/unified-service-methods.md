# Unified service methods

Make one shape the way a service verb is declared, in core and in plugins: a
method object that owns its summary, input schema, access rule, effect flags and
handler, and receives its dependencies as an explicit context argument. This
file holds what was decided, what it beats and the stages; the type signatures
are pinned in a spec before stage 0 starts.

## Today

Core and plugins declare the same facts in two different shapes.

- A **core** module keeps its handlers in `service.ts` (assembled from
  `operations/`) and its metadata in a separate `contract.ts` keyed by the same
  method names. `entries` is a per-type factory in `entries/methods.ts`, and
  `globals` keeps two more side tables, `GLOBAL_METHOD_ACTIONS` and
  `GLOBAL_METHOD_REQUIRES`. The only thing tying the two files together is
  `satisfies Record<keyof GlobalsService, ...>`, which catches a missing key but
  not an input schema that has drifted from the handler's parameter type, since
  the catalogue checks `input` against `unknown`.
- A **plugin** declares each verb with `defineServiceMethod` from
  `packages/astromech/src/plugins/define-service-method.ts`: one object with
  `access`, `summary`, `input`, `output`, the effect flags and a
  `handler(input, ctx)`. Forms, menus and assistant use it. There is no
  collection-level define; `buildFormsService` is a hand-rolled one.
- Core handlers read their dependencies **ambiently** (`getCurrentUser()`,
  `getConfig()`, `getDb()` from the AsyncLocalStorage request store); plugin
  handlers receive a `PluginContext`. The two differ only in delivery, since
  `createPluginContext` builds `user` and `role` from the same store.
- The vocabulary is split: the public surface says "method" (`ServiceMethod`,
  `defineServiceMethod`, the method manifest) while core's folders say
  `operations/`.

The split is oRPC's contract-first shape (`oc` contract, `implement(contract)`)
without oRPC's reason for it, which is shipping the contract to a client package
that has no server code. Astromech's REST client is typed by the wire and the
manifest is generated, so the second file buys nothing.

## Decided

**One `ServiceMethod` type, core and plugins.** `defineServiceMethod` is the
one way to declare a verb and moves out of `plugins/` to a neutral home. The
`access` field takes the union of both vocabularies: `'public'`,
`'authenticated'`, a permission string, or a function of the input returning a
permission or `null` (which is how a `public` global's plain read stays ungated
while its `full` read is not). `sessionScoped` stays a separate flag because it
also injects `userId`, which is more than a gate. A `requires` field carries
the capability a target must declare, as `EntryMethodContract` already does.
The `input` schema is typed against the handler's parameter, so drift is a
compile error. Prior art: tRPC and oRPC procedures, Convex `query`/`mutation`,
NestJS decorators. Every headless CMS surveyed that has bespoke verbs owns
them this way.

**`defineService(namespace, record)` assembles a module.** From one keyed
record it yields the catalogue (what the manifest, `policies/scoped-services.ts`
and REST mounting read) and the callable service (`app.globals`, the raw
trusted form). It stamps `name` (`globals.get`) onto each method after
assembly, so a method never states its own name and no typo can mis-name a
manifest entry, the reason `types/methods.ts` gives for having no `name` field
today. A handler reaches its id through `ctx.method.name`, which retires the
hand-typed `'globals.get:'` prefixes in error messages. Rejected: an array of
self-named methods, on the `defineGlobal` precedent. A global's key is data that
lands in rows and URLs, so the object had to carry it; a method's key is a
property access and the language enforces it. Drizzle dropped the restated
column name for the same reason in 0.34.

**The hand-written service interfaces in `types/` stay.** `defineService`
checks the record against them with `satisfies` rather than deriving them.
Deriving `GlobalsService` from a record whose handlers take a context that
itself contains `globals: GlobalsService` is a self-referential inference, and
the hand-written form gives better declaration output anyway.

**An explicit `AppContext`, passed and never fetched.** `PluginContext` today
is two layers glued together. The app-wide layer (`db`, `user`, `role`,
`clientAddress`, the six content services, `email`, `notify`, `logger`, `env`,
`runHook`, `database`, `methods`) becomes `AppContext`; the plugin layer
(`plugin`, `storage`, `plugins`, and `config` as the restricted view) extends
it. Handlers are `(input, ctx)` in both worlds. The request store becomes a
transport detail: the HTTP transport builds one `AppContext` per request from
it, the CLI and cron build a system context, and nothing below a method reads
the store. Prior art on the explicit side: Keystone (`context`, with
`context.sudo()` as the trusted form), Payload (`req.payload`, `req.user`),
Directus (services built over `knex`, `schema`, `accountability`), Medusa,
tRPC, oRPC, Convex, Effect. Ambient: Strapi's global `strapi`, Nuxt's
`useRuntimeConfig()`. Rejected: Hono's `context-storage` hybrid (an ambient
`getContext()` beside the explicit `c`), because an escape hatch is the second
dialect this work removes, and because a plugin calling `getContext()` cannot
be told which plugin is asking without the runtime pushing a per-plugin frame
around every call. Also weighed: the request store already lives in a registry
because the package has several bundle entry points and a second copy of the
module would be a second, empty store, and on Cloudflare it depends on the
`nodejs_als` compatibility flag. A passed object has neither problem and is a
plain value to fake in a test.

**The transaction scope stays ambient.** `DECISIONS.md` settles that
`transaction(fn)` stores the Kysely handle in AsyncLocalStorage so repositories
join a transaction without a handle passed by hand. `ctx.db` is a getter that
resolves through that scope, as `createPluginContext` does now. What this work
makes explicit is the caller's identity and the app's ports, not the
transaction.

**`operations/` becomes `methods/`.** "Method" is the public vocabulary; the
folder is the only place the other word survives. Same rename in `entries`,
`globals`, `media` and `users`.

**Entries stays a per-type factory, with the same handler signature.** Its
handlers are shared across types while its schemas and permissions vary per
type, which is Payload's resource-owned form rather than the procedure-owned
one. A catalogue is therefore either a constant record or a `(type) => record`
factory, and the manifest already calls the factory per type. Whether per-type
schemas belong on the method or on the entry type definition is left open.

**Parked.** Whether `defineGlobal` carrying its own `key`
(`globals: GlobalConfig[]`) was the right trade, given that methods
deliberately do not self-name. The two cases differ in what the identifier is
(a string that lands in rows, versus a property access), and what the array
form traded was the type-level duplicate-key check for a runtime one. Not
part of this work.

## The work

One branch, `unified-service-methods`, in a worktree at
`../Astromech-worktrees/unified-service-methods`; one commit per stage. The
manifest JSON and the OpenAPI document must be byte-identical before and after
every stage, and `packages/astromech/tests/policies/` passes unchanged at every
stage. `one-method-call-path.md` builds its runtime catalogue from
`ServiceMethodContract`; if it lands first, its catalogue reads `ServiceMethod`
objects instead, and if it lands second, it starts from them.

**Stage 0 — spec and types**

- [ ] A spec in `specs/` pinning `AppContext`, `PluginContext` as its
      extension, the unified `ServiceMethod<Input, Output, Ctx>` with `access`
      and `(input, ctx)`, and the `defineService` signature with its
      `satisfies` check. Deleted when stage 5 lands.
- [ ] `ServiceMethod` in `types/` replaces `ServiceMethodContract`; plugins
      compile unchanged. `defineServiceMethod` and `noInput` move with it.
- [ ] `defineService` beside it, stamping `name` and returning
      `{ catalogue, service }`.
- [ ] `AppContext` built in one place from the request store, with
      `createPluginContext` extending it. Tests: a context built with no
      request has `user: null` and `role: null`; the plugin layer adds
      `plugin` and namespaced `storage` and nothing else.

**Stage 1 — globals**

- [ ] `globals/operations/` to `globals/methods/`, each file exporting a
      `defineServiceMethod` object. `contract.ts`, `GLOBAL_METHOD_ACTIONS` and
      `GLOBAL_METHOD_REQUIRES` deleted; the HTTP route reads `requires` off
      the method. `service.ts` becomes `defineService('globals', ...)`.
- [ ] Handlers take `ctx` and stop calling `getCurrentUser()` and
      `getConfig()` at the top level. Helpers in `globals/internal/` take
      `ctx` as they are touched.

**Stage 2 — users, media, settings, notifications**

- [ ] The same conversion, one commit each. Each deletes a `contract.ts`.
      The three users routes that check things no contract can state (own
      profile read, last-admin guard) read `usersService.catalogue.get` and so
      on instead of `usersContract`.

**Stage 3 — entries**

- [ ] `entries/operations/` to `entries/methods/`. `entries/methods.ts`
      becomes the declared factory form of `defineService`, producing the same
      per-type catalogue the manifest reads today. `EntryMethodContract` goes,
      since `method` is stamped and `requires` is a field of the common type.

**Stage 4 — the shared helpers**

- [ ] `content/` and each module's `internal/` take `ctx` everywhere.
      `getCurrentUser()`, `getCurrentRole()` and `getConfig()` have no callers
      outside the transports and the context builder. A lint rule or import
      boundary refuses new ones from the content modules.

**Stage 5 — close out**

- [ ] `ARCHITECTURE.md`: the content-modules bullet describes one shape
      (`methods/`, `defineService`, no contract catalogue) and names
      `AppContext` as what a method receives. `TERMINOLOGY.md`: the "Plugin
      context" entry says it extends the app context; an entry for
      **service method** and **app context**. `DECISIONS.md`: entries for the
      method object over the contract split, the explicit context over ambient
      reads, and the keyed record over self-named methods, each with what it
      beat as recorded above. The `sessionScoped` entry is unchanged.
- [ ] `apps/docs/` plugin guide shows `defineServiceMethod` with the unified
      `access` and the `AppContext` fields a plugin may rely on.
- [ ] Delete the spec.

## Not changing

- `policies/scoped-services.ts` as the one place authority is applied. The
  raw service is the trusted form, the scoped wrapper is the untrusted one,
  and no `overrideAccess` flag exists to forget.
- The REST route tables in `transport/http/routes/*.ts`. Path shape and
  argument extraction are transport facts, so HTTP paths do not move onto the
  method object even though oRPC's `.route()` meta puts them there.
- The manifest format, the route table, and the public service interfaces in
  `types/`.
- The transaction scope.
