# Decisions

Live choices and what each one beat. An entry is here because the losing option is invisible in the code and tempting enough to be reached for again; when a choice is reversed the entry is rewritten, and `git log -p DECISIONS.md` holds the history. Nothing here is binding: it stops a settled question being re-argued from scratch, never a better option being taken.

## Data and schema

**The migration generator is ours, and total.** A rename is always a drop plus an add, with no rename detection. SQLite rebuilds whole tables under `defer_foreign_keys`, not `foreign_keys=OFF`. Generation errors on conflict and warns on destruction but never prompts, and runs under Node only; the application migrates through Kysely's `Migrator`. Data migrations are hand-written, and plugins ship self-contained journals. Rejected: Atlas and drizzle-kit.

**A name on a structural field is always a data key.** A named `group`, `accordion` or `tab` nests its fields under that name; without one it only draws a surface, as with Payload's groups. A named accordion or tab wraps a named group, so no walker learns a new node kind. Rejected: a separate `section` type, a `nest` flag, inert names on layout fields, the name inside options (it breaks the `type(name, options)` shape), and teaching every walker about named tabs.

**`relationships` is a derived index, never a forward read.** It rebuilds from field data, which makes polymorphism and non-atomic writes safe; order lives only in field data, and paths key on `_id`. A reference to a target that no longer exists is dropped on the holder's next write, not rejected by validation. Rejected: `populate` (if reference resolution ships, it is `resolveRefs`/`withRefs`), any `onDelete` (nothing to act on inside a JSON blob), filtering into a target's own fields, taxonomy tables, and mirror-on-write symmetry. A declared reverse field is deferred, not refused; if it returns it keys on the forward field path.

**Deleting a user is left to the database's foreign keys, and author columns go null.** Every column referencing `users` declares its `onDelete`: author columns `set null`, since content outlives its author and `createdBy` means the acting user, not an owner; sessions, accounts, content rows and plugin rows `cascade`. The migration runner refuses a database whose `PRAGMA foreign_keys` is off, since a client cannot turn it on for remote libSQL. Rejected: reassigning content (WordPress's model; there is no ownership here), cascade or restrict on author columns, and clearing them by hand, which repeats the database's work and is not atomic on D1.

**Every resource is its own three tables, not rows in one shared table.** An entry is `entries`, `entry_content` (one row per locale) and `entry_versions`, so the owner FK is real and no discriminator is needed, as in Drupal's `node`/`node_field_data`. Rejected: one shared table for all resources, which needs a reserved id prefix and a polymorphic owner column with no FK.

**One id per entry, with locale as a parameter.** `entries.id` is the id in every URL, call, relation and version list; a content row's `ContentRowId` never crosses the service boundary. Rejected: one id per locale grouped by a `localeGroup`, where every translation has to re-point each relation (WPML's failure mode).

**Trash is resource-level.** `deletedAt` sits on `entries`, so trashing takes every locale. Rejected: `deletedAt` per content row with a `cascadeLocales` flag, which made "trash this entry" and "remove this translation" one call.

**`type` is copied onto `entry_content`**, because the indexes `(type, locale, slug)` and `(type, locale, status)` cannot reach across the join. It is the one accepted denormalization. Rejected: slug uniqueness in application code (Craft's answer).

**A preview token is two columns on `entries`**: one hashed token per entry, authorizing every locale. Rejected: an `entry_preview_tokens` table, which nothing needs until someone wants a token audit trail.

**`update` with a locale that has no content row creates it.** That is how a translation is made, as with Payload's `update` and `locale`: shared fields come from the default locale and `create` validation runs on the result. Rejected: a `createTranslation` method, a second write path for the same row.

**A repository answers exact reads; fallback is the service's.** `get` on the users and media repositories returns the row asked for, or null; the fallback chain lives in `readUser` and `readMedia`. A one-off account question uses the table repository (`users.accounts.count({ role: 'admin' })`). Rejected: a named repository method per question, which hides read policy behind a name.

**`globals` is an array of self-contained `defineGlobal` objects, not a name-keyed record**, so host and plugin globals have one shape. Rejected: a `Record<string, GlobalConfig>` mirroring `entries`, and a fields mode on `admin.pages`, which puts a field tree behind a route rather than a resource.

**A media read falls back to the default locale; entries and globals do not.** A file is one file and media has no publish state, so a library in `fr` hiding every untranslated upload would be useless; `Media.locale` names the row the content came from. Entries and globals carry status per locale, and a borrowed row would misreport it. Rejected: returning `null`, and returning empty content, which makes untranslated alt text look deliberately blank.

**A media translation starts as a copy of the default-locale row**, so the read keeps its shape when the row is created. An entry's translation starts empty because title and slug are per-locale by definition. Rejected: an empty row, and creating every locale's row up front.

**`Media.updatedAt` is the file's last change, not the content row's.** It is the cache-buster on image URLs, so a caption edit must not move it. Rejected: the content row's timestamp, and exposing both on `Media`.

**A user row without a content row reads as empty content.** A `users` row written outside setup and the users service has no `user_content` row, and its owner must still sign in: reads answer `fields: {}`, and the first `update` creates the row. Rejected: an inner join, which locks the user out, and inserting on read, which puts a write in a read path.

**First-run setup writes the first admin itself, and sign-up is closed.** `POST /setup` is unauthenticated and creates the first `admin`, as Ghost, Strapi and Payload do; later accounts are created by an admin, and Better Auth's own sign-up always refuses. The gate is one `INSERT … WHERE NOT EXISTS (SELECT 1 FROM users)`, atomic on SQLite and D1, so the losing racer gets `SIGN_UP_CLOSED`. Rejected: counting users in the sign-up hook (the count and insert are separate statements), a row lock (neither SQLite nor D1 has `SELECT … FOR UPDATE`), and open sign-up with a default role (`editor` would grant content access to anyone with the URL).

**An unknown entries-list `where` or sort key throws.** `UnknownWhereKeyError` and `UnknownSortKeyError` name the key, for the entries table and custom tables alike. Rejected: ignoring it, which silently answers every row or the default order, and warning, because output is server-rendered and nobody reads the log.

**A transaction is a scope, not a handle passed by hand.** `transaction(fn)` keeps the Kysely handle in `AsyncLocalStorage`, so `getDb()` resolves it and repositories join without a `db` parameter. A nested call joins the outer scope. Hooks and fire-and-forget work stay outside it. Rejected: threading explicit handles, savepoints, and a transaction-aware repository.

**D1 degrades to sequential writes rather than refusing to boot.** It declares `supportsTransactions: false`, and `transaction()` then runs `fn` without one, so no call site handles it. Rejected: a boot-time capability gate, since nothing declares that a site needs atomicity and the partial writes are recoverable.

**better-auth queries through the app's Kysely instance, with its plugins stripped.** Kysely runs one query at a time per instance on a local libSQL file, so a second instance for better-auth fails with `SQLITE_BUSY` during an app transaction; `withoutPlugins()` drops `CamelCasePlugin`, which would rename the keys better-auth reads. Rejected: a separate dialect, a busy timeout (it blocks the event loop inside libSQL's synchronous call), and a better-auth `transaction` option (D1 has none, and it would block its hooks' queries).

**The `where` DSL is the repository's stable contract; `kysely()` is not.** Core stays inside `createRepository`'s typed methods, so the DSL grows to meet it: `or` takes `Where` clauses, `and` waits for a caller, and `contains` escapes `%`, `_` and `\` where `like` is verbatim. `kysely()` covers the rest (aggregates, expression filters) with no compatibility promise, named for the engine so the coupling is greppable, like `payload.db.drizzle`. Rejected: `query()`, which hides the coupling; a `findMany(qb => …)` builder callback; and escaping at call sites, which needs an `ESCAPE` clause the caller cannot emit.

**Every mutating entry operation is a batch, and one id is a batch of one.** So single writes are atomic, and an explicit-id batch is atomic and travels in the request body. `fromBatch` adapts each method to `id: string | readonly string[]` and unwraps `BulkOperationError` for one id. Best-effort `{ docs, errors }` is for filter-addressed operations only. Rejected: a Prisma-style `update`/`updateMany` split.

## Config, boot and packaging

**The server loads the config as a module.** The Astro integration takes a path, `virtual:astromech/config` re-exports the author's module, and boot runs in the injected middleware, so drivers, models and `{ custom: fn }` rules reach the serving process. The cost is two config evaluations. Rejected: copying live values into registries at build time, which leaves the deployed registries empty.

**A moved config is found with `--config`, and the migrations folder is a config key.** The same path goes to the integration (`configFile`) and the CLI; `migrationsDir` resolves against the working directory like every other path. Rejected: the CLI reading `astro.config.mjs` (ties it to Astro), a `package.json` field, an environment variable (it cannot come from a `.env` the config loads), and resolving next to the config file, which the built server cannot do.

**`ctx.config` is an explicit `Pick`, never a spread**, because live config would hand a plugin `ctx.config.storage.put`, bypassing `ctx.storage`'s key prefix. Rejected: a strip list, which exposes every new field by default.

**Shared backends are reached through registries, not read off the config.** `db`, `storage`, `email`, `media.image`, `ai`, `scheduler`, `plugins` and per-type `entries[].storage` are declared in config and read from a registry holding exactly what was declared; per-entity behaviour (`validate`, `hooks`, `access`, `url`) stays in config. Rejected: importing the config wherever a backend is needed, since the config module is not importable from all four module graphs and evaluates twice under `astro dev`.

**Core keeps two export maps.** `publishConfig.exports` is the `dist` map npm consumers get; the repo's `exports` may point a Vite-loaded subpath (`./middleware`, `./routes/handler.ts`, `./media/Image`) at `src`, while anything the config loads in plain Node stays on `dist`. `check:exports` keeps the keys equal and each entry's `types` and `default` in one tree. The site's Vite resolves core's `@/` only for importers inside core. Rejected: Node `#src/*` subpath imports, and a global `@/` alias, which collides with a site aliasing `@/` to its own `src`.

**A dependency reached only through an opt-in subpath is an optional peer, and one the site already instantiates is a required peer.** Each driver's backing package (`sharp`, `@libsql/client`, `aws4fetch`, …) is optional, so a Workers site installs no `sharp` binary; `check:node-imports` proves each one resolves. `react`, `react-dom`, `better-auth` and `kysely` are required, so the site and the admin share one copy (a second React is what `packages/admin/src/components/ui/instance-guard.ts` detects). Rejected: plain dependencies, which ship native binaries to sites that never use them.

**A plugin types its own tables onto the site's handle** by extending `AstromechPluginTables` in its own source. Rejected: generating declarations into `.astro/`, which buys nothing because a plugin's tables are fixed by its package. Accepted cost: a plugin in the program but not the config still adds its types.

**Unset `NODE_ENV` means production, and the middleware refuses requests while `BETTER_AUTH_SECRET` is unset.** Better Auth accepts a public default secret whenever `NODE_ENV` is not `production`. Rejected: Hono's `env()`, and refusing in `build()`, which the CLI's `validate`, `index:rebuild` and `mcp` also run.

**No runtime is declared: the entry a site deploys says which one it is.** `createWorkerEntry` supplies bindings and nominates `cloudflareCron()`, and workerd fills `process.env` from wrangler `vars`. Rejected: a `runtime` config key, whose main job would be refusing `d1({ binding })` off Workers, which works in Node through wrangler's proxy; a `RuntimeIntegration` interface with one member; and importing `env` from `cloudflare:workers`, which resolves only inside a workerd bundle.

## Structure and extension

**`ctx` is the only bridge from a plugin to core's running application.** Plugins load in plain Node at Astro config time and cannot resolve `virtual:astromech/config`, so a plugin imports only published `astromech` subpaths that load in plain Node (`check:node-imports` verifies them) and reaches the booted application through `ctx`. Rejected: `ssr.noExternal` (no effect), Node module customization hooks (process-wide, deprecated, two copies of core), and loader injection (it needs the host to load plugins).

**Core owns tool composition, because it is security-relevant.** One synchronous `ctx.methods.tools({ readOnly? })` returns role-filtered, scope-dispatching tools. Rejected: a narrow `ctx.methods.dispatch` (four seams to misorder), and a `globalThis` registry.

**An app-local plugin declares `root: import.meta.url`**, because `definePlugin` cannot infer its caller's URL. Rejected: stack-trace parsing and build-time transforms, which mis-resolve silently across bundlers.

**The application instance is the in-process surface, and `astromechClient` is a REST wrapper typed by the wire.** A test keeps them in parity. `app-context` and `plugin-runtime` reference each other, tolerated because the reference resolves at call time. Rejected: a shared `AstromechClient` contract, and dependency-inversion ports between the two.

**Authentication is its own module.** `auth/` holds the better-auth wiring, sessions, first-run setup and better-auth's tables, and imports `users`, never the reverse. Rejected: auth inside `users/` (Strapi's layout), because a session, an account and a verification are not users.

**Nothing enforces the layer model.** The layer list in `ARCHITECTURE.md` is convention; the browser boundary is checked by `shared-browser.test.ts` and `check:boot`'s headless load. Rejected: dependency-cruiser, which cost more than it caught (ports guarding no real cycle, a growing exemption list), eslint `import/no-cycle`, and a browser-only config.

**One hook runner, and a throw always propagates.** `runHook` has no try/catch, whatever the event is named, and a non-`undefined` return replaces the payload; the plugin runtime is one subscriber like any other. Rejected: failure semantics chosen by name, where `:before` hooks throw and `after*` throws are logged.

**A barrel is an entry point, not navigation.** Barrels exist only where something outside reads them (`src/exports/`, and the admin's aliased component barrels), plus the `src/types/index.ts` aggregate. `index` is reserved for a file resolved by path, so a file of real code is named for what it holds. `sideEffects` is a list because the UI instance guard, field registrations and stylesheets have effects. Rejected: barrels as intra-package boundaries (most imports bypassed them), and keeping real-code `index.ts` files as lint exceptions, which teaches that `index` means nothing.

**The media route answers like a file server, not like the API.** Its callers are `<img>` tags and CDNs: a missing file is a plain-text 404, a failed transform serves the original (as Next.js does), anything else is a `no-store` 500. `Cross-Origin-Resource-Policy` is `cross-origin` for public media and `same-site` for private. Rejected: scoping `onError` away from the media prefix, and `same-origin` for private media, which is not access control and breaks a CMS on a sibling subdomain.

**A route declares itself.** One table of `(verb, path, method id)` feeds the Hono handler, the OpenAPI document and the fetch client, and `POST /rpc/:id` reaches any manifest method. Rejected: build-time client codegen, retiring REST for RPC, and retiring the hand-written CLI commands.

**Multi-id writes over REST are `POST` action routes**, `POST /entries/:type/bulk-<action>` with `ids` in the body, as in Strapi's admin API. Most actions have no HTTP method, and a `DELETE` body has no defined meaning. Rejected: `PATCH`/`DELETE` on the collection (Directus), `where` in the query string (Payload), and one batch endpoint, which moves permission checks out of the route table.

**A service method is one object: access, schemas, effect hints, capability and handler together**, declared the same way in core and plugins, like tRPC procedures. `defineService.bind()` checks the capability `requires` names before the handler runs. Rejected: a contract catalogue keyed by name apart from the handlers, which lets a schema drift from its handler, and an `assertCapability` call in each handler, which some handlers lacked and the REST routes repeated.

**A handler receives an explicit `AppContext`; nothing below a method reads the request scope.** The transport builds one context per request; the CLI, cron and plugin `setup()` get the system context, cached once per boot. Hooks and `ctx.plugins` run as the context that called them, so a hook fired from cron or `setup()` runs as the system even inside an admin's HTTP request such as `/cron/run`. The request scope stays as transport plumbing, since it loads before the config resolves and cannot hold services. Only the transaction scope stays ambient below a method. Prior art: Keystone's `context`, Payload's `req`. Rejected: ambient reads (`getCurrentUser()`, `getConfig()`); Hono's `context-storage` hybrid, because an escape hatch is a second dialect and an ambient read cannot tell which plugin is asking; and merging the scope and the context into a Payload-style `req`, which needs a fabricated request for the CLI, cron and MCP (Payload's `createLocalReq`).

**`defineService` takes a keyed record and stamps each method's name**, so the compiler catches a mis-named method. The record is checked against the hand-written service interfaces in `types/`. Rejected: self-named methods in an array (a method's name is not data, unlike a global's key), and deriving the interfaces from the record, which is self-referential.

**Input is validated at the method, not at the transport.** `bind()` and the plugin service proxy parse each call against the method's `input`, so in-process calls, hooks, jobs and HTTP get one check. Rejected: parsing at each transport edge, which leaves in-process callers unchecked.

**An error a caller causes carries its own status and code.** Each extends `ApiError`, and `onError` answers every one from those two fields, so REST, RPC and plugin RPC answer an error the same way; a scoped-handle refusal answers 401 without a signed-in user and 403 with one. Rejected: an `instanceof` list in `onError` beside catches in single routes, which drifted (RPC answered 500 for a refusal REST caught).

**A method's input types come from its `input` schema**: the handler sees `z.output`, a caller passes `z.input`. Rejected: a hand-written type per payload reconciled by a cast, which drifts silently. One cast remains in `services/json.ts`, where `z.json()` would emit a recursive schema the manifest and OpenAPI generator cannot use.

**A method whose subject is the caller declares `sessionScoped`.** The handler reads `ctx.user`, and the scoped handle refuses the call when nobody is signed in; no permission is needed to act on your own rows. Rejected: a `sessionArgument: 'userId'` field, and injecting `userId` into the input, which the method's parse strips.

**An untrusted call reaches a service only through the scoped handle, plugin methods included.** `scopedServices(ctx)` checks each method's `access` against `ctx.role`, and `callMethod` maps a manifest method onto it for RPC, the AI tool loop, MCP and the CLI. Rejected: plugin RPC checking `access` itself, which leaves the tool loop no way to scope plugin methods.

**The admin is its own package, `@astromech/admin`, and core depends on it.** `astromech/astro` injects the admin into every site, so a site installs core alone, as with Strapi and Directus. It ships as source because a site's admin components join its build. Rejected: installing the admin beside core (Payload's model), and an `@admin/*` alias the site's Vite would also have to register.

**The admin splits its bundle by route, so `astromech()` comes before `react()`.** TanStack Router's `autoCodeSplitting` must run before `@vitejs/plugin-react`, and Astro orders Vite plugins by integration. Rejected: reordering Vite's plugin list (unsupported), hand-split `.lazy.tsx` routes, and raising `chunkSizeWarningLimit`.

**The admin bundles only the Lucide icons the config names**, through `virtual:astromech/admin-icons`. Rejected: Lucide's `icons` object (every icon), and `lucide-react/dynamic` (a chunk per icon).

**The browser-safe surface is `astromech/shared`, and a bundle test checks it.** The admin reaches core only through `astromech/shared`, `astromech/fetch` and type imports; `packages/astromech/tests/exports/shared-browser.test.ts` bundles both for the browser and fails on a Node builtin or an unlisted core file. Rejected: a `@astromech/shared` package (it does not enforce itself, per Directus issue 26613), a `browser` export condition (the Cloudflare server build may pick it up), and a `*.shared.ts` suffix, which checks a filename rather than what the bundle reaches.

**No custom-built repositories.** `EntryRepository` is internal; `tableRepository` is the one way to give a type its own storage, and `EntryType['repository']` takes the branded `CustomTableRepository`. Rejected: publishing `EntryRepository`, a compatibility promise nothing needs.

**Only entry types take storage of their own.** Entry types come in open-ended numbers and a plugin's records belong in its own table. Users are the tables Better Auth signs in against, and media has its seam at the bytes (`StorageDriver`), as with Payload's storage adapters. Rejected: a repository seam on every content module.

**Every id in the relationships index is unique across resources, custom tables included**, because `findByTarget` matches on `targetId` alone. Entries, media and custom rows take ULIDs, users UUIDs, and `tableRepository` refuses an `idColumn` not declared with `col.id()`. Rejected: `sourceType` in the key, which fixes sources but not targets.

**An entry's type is part of its address.** The repository takes the type with the id, and a row of another type reads as not found (404), as in Payload and Strapi. Rejected: a post-read type check, which answers 500 and reveals the id's real type.

## AI and the assistant

**AI is an optional core capability that hands out a model.** `src/ai/` exposes `getModel`/`hasModel`, and consumers call the AI SDK themselves; it is in core so every plugin can reach it. `AiConfig.model` is `Exclude<LanguageModel, string>` because `wrapLanguageModel` cannot wrap a gateway string, and the live model travels through boot, never the JSON virtual config. Rejected: a `rewrite()`-style facade, and a second provider-agnostic layer.

**Built on Vercel's AI SDK**, not `@anthropic-ai/sdk` (vendor-locked, no `wrapLanguageModel`), LangChain JS or Mastra (agent frameworks at the wrong level), or LlamaIndex.TS (RAG-first). The cost is frequent breaking majors, kept off the plugin surface. The assistant still requires Anthropic models, because deferred tool loading has no provider-neutral spelling.

**The assistant transcript carries Anthropic content blocks verbatim**, filtered only at render, because resuming a paused `tool_use` needs server-minted ids and unmodified `thinking` blocks. Rejected: the AI SDK's UIMessage/ModelMessage split, and a hand-written block union.

**The assistant keeps one resumable session per user, replaced on new chat.** Rejected: a browsable library (unbounded storage, retention, cross-user disclosure), and storing the acting role on the session. "What did the assistant do to my site" belongs to an audit trail at the `scopedServices` choke point.

**An approval is a server-held row, not a value in the transcript.** A mutating call pauses into `plugin_assistant_approvals` and runs from the row's stored arguments once a separate request approves it, so a rewritten transcript cannot change what runs. Rejected: `policies/confirmation.ts` (the model answers its own question), and signing the paused turn (no replay protection).

**The assistant loop runs on `streamText` with its own approval gate**: a mutating tool declares no `execute`. `smoothStream` is banned because it drops reasoning metadata from the stored transcript. Rejected: the AI SDK's tool approvals, which re-read arguments from client-posted history with no replay protection or user binding.

**Rich text crosses every boundary as HTML**, through `renderRichText` and `parseRichText` over one ProseMirror extension set; `parseRichText` throws rather than returning empty, because it is a write path. Rejected: segments (no structural change), markdown (loses a link's `target`, `rel` and `class`), raw ProseMirror JSON (models cannot produce it), and `@tiptap/html` (needs `window`). The trade: translation preserves structure by prompt and review, not by guarantee.

## Product shape

**Globals are content, config is code, secrets are env-only, and core ships no settings page.** Config and secrets live in `astromech.config.ts` and `.env`; editor-owned site-wide values are globals. Rejected: a WordPress-style General Settings page, and admin-editable secrets.

**Form notifications are one `notifications` blocks field, and spam protection is an open `SpamProvider` contract** with `turnstile()` and `recaptcha()` factories. An `{{email}}` merge tag in `to` picks the recipient. Rejected: a repeater, which cannot vary its shape per kind, and an internal-only spam registry.

## Toolchain

**The Node floor is 22.13**, in every published package's `engines`, and CI tests the floor and the Active LTS. Rejected: an unverified `>=20`, and inheriting the floor from peer dependencies.

**Tests share one module graph per worker.** Core and the admin run `pool: 'threads'` with `isolate: false`; a file that mocks a module or writes a shared global opts back into isolation through `tests/_support/isolated-tests.ts`, which `tests/isolation-list.test.ts` checks. Rejected: the default `forks` pool (it rebuilds the graph per file), vitest's `*.non-isolated.test.ts` suffix (inverted, when most files are safe), and one root workspace (no faster, and it breaks tests that find config from the working directory).

**Coverage thresholds are per directory and only raised.** Rejected: one global number, whose average hides a directory near zero.

**Drift is reported, not enforced.** `pnpm run report:drift` finds a second copy of a helper, a cast or a query key, and review decides whether to share it, schedule it or keep it. Rejected: lint bans on code shapes and a count that may only fall (they force awkward structure, as dependency-cruiser did), and periodic clean-up passes, after which the drift returns.

**`check:install` follows the installation guide on packed tarballs.** Workspace links hide packaging and generator defects, and the script reads its commands from `apps/docs/installation.md`, so the guide cannot drift from what is tested. Rejected: a fixture site, which drifts from the guide, and a stage in `verify`, which would stop the gate running offline.

## Reserved words

These words are taken; what each term means is in `TERMINOLOGY.md`. This section keeps the rejected alternatives recorded nowhere else.

- **tables.ts / schema.ts**: `defineTable` tables live in `<module>/tables.ts` (plural even for one table), and `schema.ts` holds Zod request validation. Rejected: `schema/` for table descriptors, ambiguous with Zod.
- **type**: an entry type's identifier. Rejected: `typeName` (wrong for a qualified id like `redirects/redirect`) and `typeId` (redundant).
