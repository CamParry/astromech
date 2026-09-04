# Unified service methods

The design for `roadmap/in-progress/unified-service-methods.md`: the type
signatures, the file placement and the stage 0 test list. It holds what the
roadmap leaves open, not the reasoning the roadmap already records. Deleted
when stage 5 lands.

## Types

All in `packages/astromech/src/types/`. `methods.ts` holds the method and
service shapes; a new `app-context.ts` holds the context; `plugins.ts` keeps
the plugin layer.

### `ServiceMethod`

```ts
/** What a method demands of its caller. One field, both vocabularies. */
export type ServiceMethodAccess<Input = unknown> =
    | 'public'
    | 'authenticated'
    | Permission
    | { permission: string }
    | ((input: Input) => Permission | null);

/** The one fact a handler learns about itself: the id it was assembled under. */
export type MethodContext = {
    method: { name: string };
};

export type ServiceMethod<
    Input = unknown,
    Output = unknown,
    Ctx extends AppContext = AppContext,
> = {
    access: ServiceMethodAccess<Input>;
    handler: (input: Input, ctx: Ctx & MethodContext) => Promise<Output> | Output;
    summary?: string;
    input?: z.ZodType<Input>;
    output?: z.ZodType<Output>;
    /** The capability the target must declare; absent ⇒ none. */
    requires?: string;
    sessionScoped?: boolean;
    binaryInput?: boolean;
} & ServiceMethodEffect;
```

- `access` is required. Today core's `permission` is optional and absent means
  public; plugins' `access` is required. The required form wins: an ungated
  method says `'public'` and a reader never has to remember that undefined
  means the same.
- `'authenticated'` holds when the caller has a role. `Permission` is the bare
  core form. `{ permission }` is the plugin form: a bare key resolved under the
  plugin's permission namespace by `resolvePluginPermission`, as today. The
  function form returns the permission for this input, or `null` for none.
  `'public'` and `'authenticated'` cannot collide with `Permission`, since every
  member of that union contains a colon.
- `requires` is `string` on the common type. `globals` narrows it to
  `GlobalCapability` and `entries` to `Capability` through `MethodsFor` and a
  `satisfies` on the record; the common type does not know the capability
  vocabulary and should not.
- `input` is typed against the handler's parameter. A `MethodsFor<S>` record
  derives `Input` from the interface, so an `input` schema that parses to a
  different shape is a compile error at the record, which is the drift the
  roadmap names.
- The effect fields (`mutates`, `destructive`, `idempotent`) keep their shape.

One helper answers what `access` means for one call, so the three readers stop
each holding a copy of the rule:

```ts
// permissions/access.ts
export type ResolvedAccess =
    | { kind: 'public' }
    | { kind: 'authenticated' }
    | { kind: 'permission'; permission: Permission };

export function resolveAccess(
    access: ServiceMethodAccess,
    input: unknown,
    /** The plugin's permission namespace; only the object form needs it. */
    namespace?: string
): ResolvedAccess;
```

`permissionsFor(role).allowsMethod(method, input)` becomes: `public` ⇒ true;
`authenticated` ⇒ `role != null`; `permission` ⇒ `allows(permission)`. The
object form with no namespace throws, since a core catalogue never uses it.

### `ServiceMethodContract` in the interim

Stage 0 lands with no handler on any core catalogue. Until stage 3 deletes the
last one, the readers (`codegen/method-manifest.ts`, `permissions-for.ts`,
`policies/scoped-services.ts`, `transport/http/routes/rest-route.ts`) are typed
over

```ts
export type ServiceMethodContract<Input = unknown, Output = unknown> = Omit<
    ServiceMethod<Input, Output>,
    'handler'
>;
```

and each catalogue converts `permission` to `access` (absent becomes
`'public'`). Stage 3 deletes the alias and types the readers over
`ServiceMethod`.

### `defineService` and `MethodsFor`

```ts
/** The method record a hand-written service interface demands. */
export type MethodsFor<S, Ctx extends AppContext = AppContext> = {
    [K in keyof S]: S[K] extends (input: infer I) => infer R
        ? ServiceMethod<I, Awaited<R>, Ctx>
        : never;
};

/** A method after assembly: the same object, with the id it was assembled under. */
export type NamedServiceMethod<M> = M & { name: string };

export type ServiceDefinition<S> = {
    name: string;
    /** The methods, keyed as the interface keys them, each stamped with `name`. */
    catalogue: { [K in keyof MethodsFor<S>]: NamedServiceMethod<MethodsFor<S>[K]> };
    /** The interface, with every handler closed over `ctx`. */
    bind(ctx: AppContext): S;
};

// services/define-service.ts
export function defineService<S extends object>(
    name: string,
    methods: MethodsFor<S>
): ServiceDefinition<S>;
```

- `S` is the hand-written interface in `types/services.ts`, passed explicitly:
  `defineService<GlobalsService>('globals', { get, update, ... })`. The record
  type is derived from the interface, so a missing key, an extra key, a wrong
  input type and a wrong output type are all errors at the call. This is the
  `satisfies` check the roadmap asks for, done by the parameter type rather than
  by a trailing clause.
- `catalogue` is what the manifest, `scopeMethods` and REST mounting read. Its
  entries are the same objects that were passed in, with `name` assigned after
  assembly (`'globals.get'`). No method states its own name.
- `bind(ctx)` returns the interface. Each method is
  `(input) => handler(input, withMethod(ctx, name))`, where `withMethod` is
  `Object.create(ctx, { method: { value: { name } } })`, so the context's
  getters are not evaluated and `ctx.method.name` is the assembled id. A
  handler that used to write `'globals.get: ...'` into an error message reads
  it from there instead.
- A method whose interface signature has no parameter (`() => Promise<X>`)
  infers `Input` as `undefined` and declares `input: noInput()`, as plugins do.
- There is no `service` on the definition. The callable, unbound form (what
  `app.globals` is) is built at the composition root by binding to the current
  context; see below. A content module exports its definition and nothing
  bound, which is what keeps it from importing the composition root.

### `defineServiceMethod`

`services/define-service-method.ts` holds the generic identity function and
`noInput`:

```ts
export function defineServiceMethod<Input, Output, Ctx extends AppContext = AppContext>(
    method: ServiceMethod<Input, Output, Ctx>
): ServiceMethod<Input, Output, Ctx>;
```

Core method files do not need it: a file exporting
`export const get: MethodsFor<GlobalsService>['get'] = { ... }` gets the same
contextual typing from the annotation. `plugins/define-service-method.ts`
stays as the plugin-facing export under the same name, typed with
`Ctx = PluginContext` so a plugin handler sees `ctx.plugin` with no annotation.
It is a typed alias of the generic one, not a second implementation. The
plugin barrel keeps exporting it and `noInput` from there, so plugins compile
unchanged.

### `AppContext`

```ts
// types/app-context.ts
export type AppContext = {
    /** The query handle; a getter, so it joins an open `transaction(fn)`. */
    readonly db: Kysely<DB>;
    config: ResolvedConfig;
    user: User | null;
    role: Role | null;
    clientAddress?: string | undefined;
    entries: EntriesService;
    globals: GlobalsService;
    media: MediaService;
    settings: SettingsService;
    users: UsersService;
    /** Session-scoped: acts for `user`. */
    notifications: NotificationsService;
    email: PluginEmail;
    notify: (input: NotifyInput) => Promise<void>;
    logger: PluginLogger;
    env: Record<string, string | undefined>;
    runHook: <E extends HookEvent>(
        event: E,
        payload: HookPayloadFor<E>
    ) => Promise<HookPayloadFor<E>>;
    database: PluginDatabase;
    methods: PluginMethods;
};
```

The six services on a context are bound to that context: `ctx.globals` is
`globals.bind(ctx)`, resolved lazily by a getter and memoised. A handler that
calls a sibling through `ctx` therefore acts as the same user, and nothing on
the context re-reads the request store. In stage 0 no module exports a
definition yet, so each service field is the existing service object (which
still reads the store, as today); the stage that converts a module switches
its field to `bind(ctx)`.

`PluginContext` becomes the plugin layer over it:

```ts
export type PluginContext = Omit<AppContext, 'config' | 'entries' | 'globals'> & {
    plugin: ResolvedPluginIdentity;
    config: PluginConfigView;
    /** Reads default to the `full` shape, as today. */
    entries: TypedEntriesService;
    globals: TypedGlobalsService;
    storage: PluginStorage;
    plugins?: PluginServiceNamespace | undefined;
};
```

`Omit` rather than `extends`, because `PluginConfigView` is a `Pick` of
`ResolvedConfig` and so a supertype, which `extends` refuses. The port types
(`PluginEmail`, `PluginLogger`, `PluginDatabase`, `PluginMethods`) keep their
names; they are public to plugin authors and renaming them is not this work.

## Files

Two new modules.

**`services/`** is a pure leaf: `define-service.ts`, `define-service-method.ts`
(moved from `plugins/`, which keeps the plugin-typed alias). It imports
`types/` and nothing else. Every content module imports from it.

**`app-context/`** is the other half of the composition root, beside
`plugins/runtime/plugin-runtime.ts`, and imports the six service definitions:

```ts
// app-context/app-context.ts
export type AppContextInput = {
    user: User | null;
    role: Role | null;
    clientAddress?: string | undefined;
};
/** One context, with the services bound to it. */
export function createAppContext(input: AppContextInput): AppContext;
/**
 * The context for the current request, built once per request from the
 * request store and cached on it; a system context (user and role null)
 * outside one. The only place below a transport that reads the store.
 */
export function currentAppContext(): Promise<AppContext>;

// app-context/services.ts
/** The interface, each call bound to `currentAppContext()`. */
export function bindCurrent<S extends object>(definition: ServiceDefinition<S>): S;
export const globalsService: GlobalsService; // = bindCurrent(globals), and so on for the six
```

- `currentAppContext` caches the built context on the `RequestContext` entry
  (a new optional `app` field beside `user` and `role`), so one request builds
  one context however many service calls it makes. Outside a request every call
  builds a fresh system context, which is a handful of getters.
- `astromech.ts` composes `app.globals` from `app-context/services.ts`.
  `policies/scoped-services.ts` wraps the same bound services in
  `definition.catalogue`. `createPluginContext(identity, user, role,
clientAddress)` spreads `createAppContext({ user, role, clientAddress })` and
  adds the plugin layer, overriding `entries`, `globals` and `settings` with
  the `full`-default wrappers it applies today.
- The HTTP transport keeps `runWithRequest`; a route that already has
  `c.var.user` and `c.var.role` may call `createAppContext` directly and
  should, since it also knows `clientAddress`. The CLI and cron call
  `currentAppContext()` outside a request and get the system context.
- `app-context/services.ts` gains one bound constant per module as that
  module converts; in stage 0 it holds only `bindCurrent`, exercised by a test
  over a fake definition, and `createPluginContext` is `createAppContext`'s
  first real caller.

`ARCHITECTURE.md`'s layer table gains `services` on the pure-leaf line and
`app-context/app-context.ts` on the composition-root line; the content-modules
bullet changes in stage 5.

## Stage 0 tests

`packages/astromech/tests/services/define-service.test.ts`:

- `defineService` over a two-method fake interface stamps `name` as
  `'<service>.<key>'` on each catalogue entry, and the catalogue entries are
  the objects passed in (`toBe`, not `toEqual`).
- `bind(ctx).method(input)` calls the handler with `input` and a context whose
  `method.name` is the stamped id and whose other members are `ctx`'s, with
  `ctx`'s getters untouched (a getter that throws on read is not read).
- A record missing a key, or whose handler returns the wrong type, fails
  `tsc`; covered by an `@ts-expect-error` block in the test file.

`packages/astromech/tests/app-context/app-context.test.ts`:

- `currentAppContext()` outside `runWithContext` has `user: null` and
  `role: null`; inside a context whose session resolves to a user it carries
  that user and role, and two calls in one request return the same object.
- `bindCurrent(definition).method(input)` over a fake definition, called
  inside `runWithContext`, hands the handler a context carrying that request's
  user; outside one, the system context.
- `createPluginContext` over the same input has every `AppContext` key, plus
  `plugin`, `storage`, `plugins`, and `config` as the view, and no other key.

`packages/astromech/tests/permissions/access.test.ts`:

- `resolveAccess` over each of the five forms, including the function form
  answering `null`, and the object form with and without a namespace.

The existing suites in `tests/policies/`, `tests/codegen/` and
`tests/transport/` pass unchanged, and the manifest snapshot and OpenAPI
document are byte-identical.
