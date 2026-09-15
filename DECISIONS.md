# Decisions

What was chosen, and what it beat. Present tense: this file describes what holds
now, and is edited when a choice is reversed. The history of every reversal is
`git log -p DECISIONS.md`, and the argument as originally written is in the
commit that made the change.

An entry earns its place when the losing option is invisible in the code and
attractive enough that someone would reach for it again. A landed rename, a file
that moved, a rule the linter enforces: the code already says it, so it is not
here. Rules you apply while writing code are in the skills; what a term means
today is in `TERMINOLOGY.md`; where code lives is in `ARCHITECTURE.md`.

Nothing here is binding. It is evidence, so a settled question is not re-argued
from scratch — never so a better option can be refused. When something better is
known, edit the entry and say what changed in the commit.

## Data and schema

**The migration generator is ours, and total.** No Atlas, no drizzle-kit. A
rename is a drop plus an add, always: no rename detection, ever. SQLite rebuilds
whole tables under `defer_foreign_keys`, not `foreign_keys=OFF`. Generation
errors on conflict and warns on destruction, but never prompts, and runs under
Node only; the application migrates through Kysely's `Migrator`. Schema is
generated, data is hand-authored, and plugins ship self-contained journals.
Rejected: a `findMany(qb => …)` builder callback (use `kysely()`), and `populate`
on `reference` columns — if one ever ships it must be `resolveRefs`/`withRefs`.

**`relationships` is a derived index, never a forward read.** It rebuilds from
field data, which is what makes polymorphism and non-atomic writes safe; order
lives only in field data, and paths key on `_id`. Rejected: `populate` (leaks
through relation traversal), any `onDelete` (cascade and set-null are
unimplementable against a JSON blob, restrict refused on principle), filtering
into a target's own fields, taxonomy tables, and mirror-on-write symmetry. A
declared reverse field is deferred rather than refused; if it returns it keys on
the forward field path, not the relation name. Editorial identity is a `profile`
entry linking to `users`.

**Author columns are `ON DELETE set null`, cleared in the app.**
`entries.createdBy`/`updatedBy`, the same pair on `entry_content`,
`entry_versions.createdBy`, and every other author column in core (including
`settings.updatedBy`) reference `users` and go null when that user is deleted:
content outlives its author, and the column already means "the acting user, if
known". Rejected: reassigning to another user (WordPress's model, too heavy for
a "who touched this row" stamp, and Astromech has no ownership concept to
reassign to), cascade (deletes the content), and restrict (blocks a legitimate
user removal). libSQL opens with foreign keys off, so the FK action is inert
there and `deleteUser` nulls the columns itself: the DB clause records the
intent and enforces it on D1, the app guarantees it on every driver. This is a
column FK, unlike the `relationships` index above whose dangling ids are field
data with nothing to act on.

**Every resource is its own three tables, not rows in one shared table.** An
entry is `entries` (what is unique per item and shared across its locales),
`entry_content` (one row per locale of what editors author) and `entry_versions`
(snapshots of a content row), so the FK from content to its owner is real and no
discriminator column is needed. Prior art: Drupal's `node`/`node_field_data` and
Craft's `elements`/`elements_sites`. Rejected: one shared table holding entries,
users, media and globals as typed rows, which needs a reserved id prefix,
suppression in the admin config, the API routes, the permission vocabulary and
the relation targets, a polymorphic owner column with no FK, and an orphan check
to cover for it. Also rejected: renaming that table to `documents` or `elements`,
words already refused below.

**`_content`, not `_locales`.** It names what the table holds, `entry_versions`
reads as versions of `entry_content` where "versions of locales" does not, and
it reads right on a single-language site. Rejected: Payload's `_locales`, whose
table holds only the localized fields with the rest on the base row, so the name
does not transfer.

**One id per entry, with locale as a parameter.** `entries.id` is the id in
every URL, service call, relation, version list and preview URL; a content row's
id is branded `ContentRowId` and never crosses the service boundary. Switching
locale changes an argument, never the id. Rejected: one id per locale row
grouped by an opaque `localeGroup`, under which a relation names one language's
row and every translation has to re-point it, which is WPML's failure mode.

**Trash is resource-level.** `deletedAt` sits on `entries`, so trashing takes
every locale with it and `trash`, `restore`, `delete` and `emptyTrash` take no
locale. Rejected: `deletedAt` per content row with an opt-in `cascadeLocales`
flag, which made "trash this entry" and "remove this translation" the same call
with an argument between them.

**`type` is copied onto `entry_content`.** The slug-unique index
`(type, locale, slug)` and the list index `(type, locale, status)` cannot reach
across the join to `entries`. It is the one accepted denormalization. Rejected:
enforcing slug uniqueness in application code, which is Craft's answer, to keep
the column single-homed.

**A preview token is two columns on `entries`.** `previewToken` (the hash,
unique) and `previewTokenExpiresAt`: one token per entry, authorizing every
locale, with the locale picked by the preview URL. Rejected: an
`entry_preview_tokens` satellite, a one-to-one table whose own created columns
nothing read. Wanting a token audit trail is the signal to bring a table back.

**`update` with a locale that has no content row creates it.** That is how a
translation is made: shared fields are inherited from the default locale and
`create` validation runs on the merged result. Payload works the same way, where
`update` with a `locale` writes that locale whether or not it existed. Rejected:
a dedicated `createTranslation` method, a second write path for the same row, and
duplicating the entry into a translation group, which `duplicate` no longer does
(it copies an entry, not a locale).

**The word is `globals`.** Payload (`globals: []`), Craft ("Global Sets") and
Statamic ("Globals") share it for editor-owned, exactly-one, site-wide content.
Rejected: "single types" (Strapi; two words, and it names the constraint on a
type rather than the thing), "singletons" (Sanity and Directus; names the
constraint, and a stranger does not guess it), and "settings" or "options"
(WordPress; "settings" is reserved for operator config and the key-value table
keeps the name).

**A global's identifier is `key`, not `slug`.** `slug` is editor-authored,
per-locale and appears in URLs, unique per `(type, locale)`; a global's
identifier is developer-written, locale-invariant and never in a URL, so it
pairs with `type` on entry types. Rejected: Craft and Statamic's "handle", which
is precise but not a word a reader guesses.

**`globals` is an array of self-contained `defineGlobal` objects, not a
name-keyed record.** A global carries its own `key`, so host and plugin globals
have one shape and a global moves between them unchanged. A key declared twice
in one array is a crash-loud `resolveConfig` error naming both declarations.
Rejected: a `Record<string, GlobalConfig>` mirroring `entries` (it splits the
identifier from the object and gives plugin globals a second shape), and a
fields mode on `admin.pages`, which put a field tree behind a route rather than
behind a resource.

**A media read falls back to the default locale; entries and globals do not.**
`media.get` and `media.query` in a locale with no content row return the item
with the default locale's content, and `Media.locale` names the row the content
came from. A file is one file, and media carries no publish state for a fallback
to misreport, so a library listing in `fr` that hid every untranslated upload
would be useless. Entries and globals do not fall back: each of their locales
carries its own status and staged change, so borrowing another locale's row
would report a publish state that locale does not have. `Media.locales` says
which rows exist, so the admin can still offer to add one. Prior art: Drupal's
file entities fall back the same way. Rejected: returning `null`, and returning
the item with empty content, which makes an untranslated alt text look
deliberately blank.

**A media translation starts as a copy of the default-locale row.** The first
`media.update` to a locale with no row inserts one seeded with that row's
`title`, `alt`, `caption` and `fields`, then applies the patch, so the read does
not change shape at the moment the row is created, which is what the fallback
promised. An entry starts a translation empty because a title and a slug are
per-locale by definition; alt text is the same text until someone translates it.
Rejected: an empty row (it turns a fallback read into a blank one on first
save), and creating every locale's row up front.

**`Media.updatedAt` is the file's last change, not the content row's.** It is
the cache-buster the admin appends to every image URL, so it has to move when
the file is replaced and stay put when only the caption is edited; `replace`
writes `updatedBy` on the resource row for the same reason. A global exposes its
content row's `updatedAt` because a global has no file. `MediaVersion` and the
content row keep their own timestamps for anything that wants the edit time.
Rejected: the content row's timestamp (a caption edit would bust every cached
variant), and a second field on `Media` for each, which asks every caller to
know which one it wants.

**A user row without a content row reads as empty content.** better-auth mints
`users` rows outside Astromech's write path, and the hook that adds the
default-locale `user_content` row runs after that insert, so a provider added
later may not run it. A session must not fail on a profile nobody has written:
`get` and `query` answer with `fields: {}`, the default locale and no locales,
and the first `update` creates the row. Rejected: a strict inner join, which
locks a user out of their own profile, and a lazy insert on read, which puts a
write in a read path.

**Only a user's `fields` are versioned.** `name`, `email`, `image` and `role`
are the account row, which better-auth and the roles machinery own; a version
of a profile is a version of what the site's own fields say, not of an account
change that machinery already tracks.

**Sign-up is closed once a user exists.** First-run setup creates the first
account as `admin`, and every later account is created by an admin through the
users service, as Payload's `first-register` and Strapi's `register-admin` do.
The guard is Better Auth's `databaseHooks.user.create.before`, which every
Better Auth sign-up path runs through and the users service does not. Its count
and the insert share Better Auth's adapter but no transaction, so two sign-ups
racing on an empty install can both get `admin`; anyone who can reach an
install with no users can finish setup first anyway. Rejected: open sign-up
with a least-privileged default role (the built-in `editor` still grants
content access to anyone with the URL), and Better Auth's `disableSignUp` plus
a setup endpoint of our own (setup would have to write the credential account
itself).

**Author clearing enumerates columns from the table descriptors.** The
hand-kept list under `entries/internal/` was three tables when nine carried the
column; `users/internal/clear-author-references.ts` walks `CORE_TABLES` and
clears every column whose FK targets `users` with `onDelete: 'set null'`.
Rejected: relying on `ON DELETE set null` alone (libSQL does not enforce
foreign keys), and a plugin table walk (a plugin's table descriptors reach the
runtime only through `config.plugins`, which `ResolvedConfig` strips, so the
delete path cannot enumerate them without being handed the config).

**Filtering entries by field data rides declared expression indexes** over
`json_extract(fields, '$.path')` on `entry_content`, with the index DDL and the
query SQL emitted from one declaration. Undeclared field filters throw. Rejected:
generated columns on the shared content table (no precedent, and it killed Craft
2-4), a typed EAV lookup table, and silent unindexed JSON scans.

**Search is a derived FTS5 external-content table** (`content='entry_content'`,
trigger-synced, per-field `searchable`), so it indexes one locale per row. Rejected: a `search_index` text column
queried with `LIKE` (the WordPress and Directus anti-pattern), indexing rendered
output, and an external engine in core.

**An unrecognised entries-list `where` key throws `UnknownWhereKeyError`.**
Dropping it silently returned every row. Rejected: warning instead, because the
output is server-rendered and nobody reads the log.

**A transaction is a scope, not a handle passed by hand.** `transaction(fn)` in
`database/` stores the Kysely handle in `AsyncLocalStorage`, so `getDb()`
resolves it and repositories join automatically: no `db` parameter, no
`txRepository`. Nesting joins the outer scope. Hooks and fire-and-forget work
stay outside it. Rejected: threading explicit handles, savepoints, and a
transaction-aware repository.

**The `where` DSL is the repository's stable contract; `kysely()` is not.** Core
code stays inside `createRepository`'s typed methods, so the DSL grows to meet it
rather than call sites dropping to raw SQL. `kysely()` hands out the Kysely
handle, the table key and the DSL's own `where` compiler for what is left over:
aggregates, and expression filters such as the media mime buckets. It is named
for the engine on purpose — the coupling is greppable, and Kysely types reach the
published surface only through its return type — and it carries no compatibility
promise. Rejected: `query()`, which collided with query-as-operation and hid the
coupling, and a deprecated alias for it, since nothing is live. Prior art:
`payload.db.drizzle` and `strapi.db.connection`.

**What the `where` DSL grew, and what each name beat.** `or` takes an array of
full `Where` clauses, OR-ed together and then ANDed with sibling keys; a branch is
an ordinary `Where`, so nesting falls out of the recursion. There is no `and`,
because sibling keys already AND and no call site needs `(A OR B) AND (C OR D)` —
Payload ships both, we grow on demand. `contains` takes plain text and escapes
`%`, `_` and `\` into a `LIKE … ESCAPE '\'`, so a search for `100%` matches that
literal text; `like` stays a verbatim pattern. Rejected: escaping at each call
site, which cannot work without an ESCAPE clause the caller has no way to emit,
and which every future caller would have to remember. `pluck(column, params)` is
Knex's and Rails' name, chosen over a `select` param on `findMany` whose return
type would turn conditional for one caller. `createMany(rows, { onConflict:
'ignore' })` takes Prisma's method name but spells the option as the SQL it emits
rather than Prisma's `skipDuplicates`.

**Every mutating entry operation takes `ids` and returns the batch.** A single id
is a batch of one, so single writes are atomic; explicit-id batches are atomic,
return their rows, and travel in the request body. `entries/service.ts` is the
only overload adapter and unwraps `BulkOperationError` for one id, while the HTTP
error handler looks through the envelope for a `ValidationError` cause and
answers 422. Best-effort `{ docs, errors }` is reserved for filter-addressed
operations. Rejected: a Prisma-style `update`/`updateMany` split.

**D1 degrades to sequential writes rather than refusing to boot.** It declares
`supportsTransactions: false`, and the degrade lives inside the repository
method, not at call sites. Rejected: a boot-time capability gate — nothing
declares that a site needs atomicity, so every D1 site would fail to boot, and
the partial writes are recoverable.

**`users` has a descriptor that describes better-auth's format, not one that
imposes ours.** ISO-8601 TEXT timestamps and 32-character alphanumeric ids, with
a baseline-DDL parity test as the proof they agree. `sessions`, `accounts` and
`verifications` stay hand-authored on `LEGACY_CODECS`. Rejected: teaching the
parser to accept both timestamp formats.

**`createdBy` is the acting user who wrote the row**, pairing with `createdAt`,
not the author of the content the row holds. It is `getCurrentUser()?.id`, null
outside a request, and carries a live FK to `users` — so a test harness injecting
an identity must seed the user row.

## Config, boot and packaging

**The server loads the config as a module.** The Astro integration takes a path,
`virtual:astromech/config` re-exports the author's module, and boot happens in
the injected middleware, so drivers, models and `{ custom: fn }` rules reach the
serving process. Rejected: copying live values into registries at boot, which
only worked in dev because a build-time boot left the deployed registries empty.
The cost is two config evaluations, one of which boots.

**`ctx.config` is an explicit `Pick`, built field by field, never a spread.**
Live config makes `ctx.config.storage.put` and `ctx.config.email.driver.send`
working functions that bypass `ctx.storage`'s key prefix. Rejected: extending a
strip list, which leaves every new field visible by default.

**A capability slot holds exactly what the config declared, normalised, with
nothing glued in from another key.** App-wide shared resources (`db`, `storage`,
`email`, `media.image`, `ai`, `scheduler`, `plugins`, per-type
`entries[].storage`) are declared in config and reached from a registry;
per-entity behaviour (`validate`, `hooks`, `access`, `url`, `condition`) stays in
config. The registries survive live config because the config module is not
importable from all four graphs and evaluates twice under `astro dev`.

**`exports` resolves `src`, and `publishConfig.exports` restores `dist` at pack
time**, so a core edit needs no root build (Payload 4's pattern). Within one
entry, `types` and `default` must resolve into the same tree, enforced by
`check:exports`; never compare targets across the two maps. Only Vite-loaded
subpaths can move, because the config half loads in plain Node with no alias and
no TypeScript. Rejected: pointing `types` at `src` with relative specifiers,
de-aliasing 825 `@/` specifiers, and Node `#src/*` subpath imports.

**A dependency reached only through an opt-in subpath is an optional peer, and
one the site already instantiates is a required peer.** `sharp`,
`@libsql/client`, `@libsql/kysely-libsql` and `aws4fetch` each back a single
driver subpath, so they sit in `peerDependencies` with
`peerDependenciesMeta.optional`: a Workers site installs no `sharp` binary, and
`check:node-imports` loads each of those subpaths to prove the peer is reachable
when a site does install it. `react`, `react-dom`, `better-auth` and `kysely`
are required peers, so the site and the admin share one copy of each; a second
React is what `packages/admin/src/components/ui/instance-guard.ts` exists to detect, and a
second `kysely` or `better-auth` splits the query builder types and the session.
`linkedom` stays a plain dependency because the root export imports it, so every
site loads it whatever it configures. Rejected: keeping all of them as
dependencies, which ships tens of megabytes of native binary to sites that never
transform an image.

**Codegen emits `export type`, not `export interface`**, so a generated field
type gets an implicit index signature and satisfies `Entry['fields']`. Rejected:
a hand-added `[k: string]: unknown`, which reopens the type to typos.

**A plugin types its own tables onto the site's handle.** Each plugin package
extends `AstromechPluginTables` with `PluginDB` in a `declare module 'astromech'`
block in its own source, and `DB` extends that interface, so `db` on a site
carries every plugin's tables without the site naming them. Rejected: generating
the declarations into `.astro/` from the installed plugins, which buys nothing
because a plugin's tables are fixed by its package, not by the site's config.
Accepted cost: a plugin package in the program but not installed in the config
still adds its table types.

**Every environment read goes through `src/env.ts`** (`resolveEnv`, `getEnv`,
`getEnvRecord`, `setEnvSource`). Unset `NODE_ENV` means production, and a Worker
with no named scheduler throws. `integrations/` holds framework and runtime
integrations side by side; a runtime earns a directory only when its environment
or entry point is non-standard, so Node and Vercel have none. Rejected: Hono's
record-returning `env()`, and a `RuntimeIntegration` interface for one member.

**No runtime is declared: the entry a site deploys says which one it is.**
`createWorkerEntry` supplies the Worker's bindings and nominates
`cloudflareCron()`, workerd fills `process.env` from wrangler `vars` so
`resolveEnv` needs no Cloudflare path of its own, and Node needs nothing.
Rejected: a `runtime` config key, whose strongest job was refusing
`d1({ binding })` off Workers, a setup that works in Node through wrangler's
platform proxy; inheriting from Astro's Cloudflare adapter, whose per-request
environment Astro 6 removed; and importing `env` from `cloudflare:workers` in
core, which resolves only inside a workerd bundle while core also loads in plain
Node for the CLI and the build.

## Structure and extension

**`ctx` is the only bridge from a plugin to core.** Plugins load in plain Node at
Astro config time and cannot resolve `virtual:astromech/config`, so a plugin may
import `astromech` and `astromech/ui` and nothing else; `astromech/methods` is
core-internal. Rejected: `ssr.noExternal` (tried, no effect), Node module
customization hooks (process-wide, deprecated, and they yield two copies of
core), and VS Code-style loader injection (it needs the host to load plugins).

**Core owns tool composition, because it is security-relevant.** The port is one
async `ctx.methods.tools({ readOnly? })` returning role-filtered,
scope-dispatching tools. Rejected: a narrow `ctx.methods.dispatch` (four seams,
four chances to misorder them), and a `globalThis` registry (untyped, and it
competes with `ctx`).

**An app-local plugin declares `root: import.meta.url`.** `definePlugin` cannot
infer its caller's module URL, and the alternatives (stack-trace parsing,
build-time transforms) mis-resolve silently across bundlers. A published package
resolves assets through its `./admin/*` exports subpath instead and needs no
`root`.

**The application instance is the in-process surface, and `astromechClient` is a
REST wrapper typed by the wire.** No shared contract type spans the two: parity
is kept by a test. `plugins/runtime/plugin-runtime.ts` imports the module
services directly, tolerating the entries/runtime mutual reference because it
resolves at call time. Rejected: a shared `AstromechClient` contract, and
dependency-inversion ports between the runtime and the modules.

**Nothing enforces the layer model.** dependency-cruiser cost more than it
caught: three ports guarding no real cycle, eight exemptions and hand-written
rules, and `no-circular` excluding the modules. The layer list stays as
documented convention in `ARCHITECTURE.md`, and the browser boundary rides on
`check:boot`'s headless load. Rejected: a browser-only config, eslint
`import/no-cycle`, and case-by-case relaxation.

**One hook runner, and a throw always propagates.** `hooks/` holds `addHook`,
`runHook` and `hasHook`; a non-`undefined` handler return replaces the payload;
there is no try/catch, whatever the event is named. Hooks are not a plugin
concept — the plugin runtime is one subscriber like any other. Rejected: two
name-keyed dispatchers where a `:before` substring decided failure semantics and
`after*` throws were swallowed and logged.

**A barrel is an entry point, not navigation.** Re-export barrels exist only
where something outside reads them: `src/exports/` in core and in the admin
package, one file per published subpath, plus the two under the admin's
`src/components/` that its Vite helper aliases. Every other import names the file that declares the symbol.
`src/types/index.ts` is the exception, kept because it is type-only — 359 imports
that erase at compile time, so there is no runtime graph to shrink. The name
`index` is reserved for a file something resolves by path — a tsup entry, a Vite
alias target, a router route page — so a file holding real code takes the name of
what it holds instead: `src/env.ts` and `src/transport/http/client.ts`, not an
`index.ts` a directory down. An eslint selector enforces this, and `sideEffects`
is an array rather than `false`, because the UI barrels' instance guard, the
admin entry's field and cell registrations, and every admin component's
stylesheet do have effects; the admin package's manifest names them. Rejected: barrels as intra-package boundaries — 93%
of imports already went around them, nothing enforced barrel-only entry, and the
browser boundary needed the opposite. Also rejected: letting a real-code
`index.ts` keep its name and carrying it as a lint exception, which grew the
exception list to thirteen paths and taught readers that `index` means nothing in
particular. The import-time argument that Vite's performance guide, TkDodo and
Atlassian make did not reproduce here: vitest's aggregate module-import time
stayed inside its run-to-run variance on both sides, so the reasons above carry
the change alone.

**The media route answers like a file server, not like the API.** It lives in
the Hono app for one terminal handler, but its callers are `<img>` tags and CDNs,
so it keeps none of the API's response shapes. The handler catches its own
failures: a missing file is a plain-text 404, a failed transform serves the
original (as Next.js's image optimiser does), and anything else is a plain-text
500 marked `no-store`. It answers `GET` and `HEAD` and a 405 for anything else.
Its `Cross-Origin-Resource-Policy` follows `media.access`: `cross-origin` for
public media, `same-site` for private, where the API keeps `same-origin`.
Rejected: scoping `onError` away from the media prefix, which splits error
handling across two places; and `same-origin` for private media, which is not
access control yet and would break a site serving its pages and its CMS from two
subdomains.

**A route declares itself.** One table of `(verb, path, method id)` plus wire
facts is read by the Hono handler, the OpenAPI document and the fetch client;
only per-route `args` are hand-written, and a bespoke handler says so with
`handler: 'bespoke'`. `POST /rpc/:id` reaches any method in the manifest.
Rejected: build-time client codegen, retiring REST in favour of RPC, and retiring
the hand-written CLI commands.

**Multi-id writes over REST are `POST` action routes.** Update, trash, delete,
restore, publish, unpublish and schedule each have a
`POST /entries/:type/bulk-<action>` route taking the ids as `ids` in the JSON
body, as Strapi's admin API does (`POST .../actions/bulkDelete`) and Google's
AIP-235 recommends for batch deletes. Four of the seven have no HTTP method of
their own, so collection verbs would still need `POST` for most of them, and a
`DELETE` body has no defined meaning under RFC 9110. Rejected: Directus's
`PATCH` and `DELETE` on the collection with a body; Payload's `where` in the
query string, which addresses a filter rather than a list of ids; AIP's
`:batchDelete` suffix, which few web APIs outside Google use; and one
JSON:API-style batch endpoint, which moves the per-action permission checks out
of the route table into a handler.

**A service method is one object: access, schemas, effect hints, capability and
handler together.** `defineServiceMethod` declares a verb the same way in core
and in plugins, and `access` is one union for both: `'public'`,
`'authenticated'`, a permission string, `{ permission }` resolved under a
plugin's permission namespace, or a function of the input answering a permission
or `null`. Rejected: the contract-catalogue split, a verb in one file and its
metadata in another keyed by the same name, which tied the two together by
convention alone and let an input schema drift from the handler it described.
It is oRPC's contract-first shape without oRPC's benefit, since nothing here
ships a contract to a client package that has no server code. Prior art: tRPC
and oRPC procedures, Convex `query`/`mutation`.

**A handler receives an explicit `AppContext`; nothing below a method reads the
request store.** The store is a transport detail that builds one context per
request, and the CLI and cron get a system context instead. Rejected: ambient
reads (`getCurrentUser()`, `getConfig()`), and Hono's `context-storage` hybrid
of an ambient `getContext()` beside the explicit `c`, because an escape hatch is
a second dialect, and because an ambient read cannot tell which plugin is
asking. The transaction scope stays ambient, as the decision that a transaction
is a scope rather than a handle passed by hand settles: `ctx.db` is a getter
resolving through the open `transaction(fn)`, so what is explicit here is the
caller's identity and the app's ports, not the transaction. Prior art:
Keystone's `context`, Payload's `req`, Directus services built over
`accountability`.

**`defineService` takes a keyed record and stamps each method's name; a method
never states its own name.** The key is a property access the language already
checks, so a typo cannot mis-name a manifest entry. Rejected: an array of
self-named methods, on the `defineGlobal` precedent. A global's key is data that
lands in rows and URLs, so the object has to carry it, while a method's key is
not. The hand-written service interfaces in `types/` stay and the record is
checked against them rather than derived from them: deriving an interface from a
record whose handlers take a context that itself carries that interface is
self-referential.

**Input is validated at the method, not at the transport.** `defineService.bind()`
parses the call against the method's own `input` schema before the handler runs,
and the plugin service proxy does the same for a plugin method, so an in-process
call, a hook, a job and an HTTP request all get one check. Rejected: parsing at
each transport edge, which left in-process callers unchecked and led handlers to
re-parse the slot the edge had already parsed. The cost is that a transport
wanting wire-named errors maps the thrown `ValidationError` rather than parsing
itself: the REST route rebases the field paths it reports under `bodyKey` and
`wireNames` on the way out.

**A method's input types come from its `input` schema.** `defineServiceMethod`
reads both sides off it: the handler's parameter is `z.output` (defaults applied,
ISO strings coerced to dates) and what a caller passes is `z.input`, which is
what `MethodsFor` checks against the hand-written service interface and what the
domain input types (`EntryCreateData`, `UserUpdateData`, and the rest) are
declared as. A service interface therefore states what the schema really accepts,
so `schedule` takes `publishedAt: Date | string`. Rejected: a hand-written type
per payload with `as unknown as z.ZodType<T>` on the schema to reconcile the two,
one per module, which drifted the moment they disagreed: `users.create` defaults
`role`, and its handler read as optional a key the parse had already set. One
cast survives, in `services/json.ts`, where `fields` is an open record at runtime
and `JsonObject` to the type system: `z.json()` types it exactly but emits a
recursive `anyOf` into the method manifest, and `z.custom<JsonValue>()` is a
shape the OpenAPI document generator refuses to render.

**A method whose subject is the caller declares `sessionScoped`.** The subject
is `ctx.user`, read by the handler; the scoped handle
(`policies/scoped-services.ts`) refuses the call when nobody is signed in. No
permission is declared, because any signed-in caller may act on their own rows.
Rejected: a general `sessionArgument: 'userId'` field; and injecting `userId`
into the input, which the method's own parse strips and which put a key the
schema does not declare onto the call.

**An untrusted call reaches a service only through the scoped handle, plugin
methods included.** `scopedServices(role)` checks a method's declared `access`
against the role before the call, for core and plugin methods alike.
`callMethod` (`policies/call-method.ts`) maps a manifest method onto that
handle, or onto the raw services for a trusted caller, and is what RPC, the AI
tool-loop, MCP and the CLI call through. Rejected: plugin RPC checking `access`
in a function of its own, which left the AI tool-loop no way to scope a plugin
method and so no plugin methods at all. Rejected too: a runtime catalogue of
Zod input schemas per transport, since each method already parses its own
input; and a REST catalogue resolved per request so the mount could check an
entry type's or a global's permission before reading the body, which each of
those routes' `precondition` already does.

**The admin is its own package, `@astromech/admin`, and core depends on it.**
The admin app, the component kit and the shell page live in `packages/admin`.
`astromech/astro` injects the admin into every site, so core depends on the
admin package, as Strapi's and Directus's cores depend on their admin apps, and
a site installs core alone. `astromech/ui`, `astromech/ui/app`,
`astromech/ui/layout` and `astromech/ui/fields` stay, as one-line re-exports,
so no plugin import changes. The admin still ships as source, because a site's
own admin components join its module graph at build time, and it publishes a
Node-side Vite helper holding its aliases, its share of `optimizeDeps.include`,
the TanStack Router plugin and the shell's path. Imports inside the admin are
relative. The admin peers on core and links it in the workspace for its built
kit, so the two packages depend on each other, which pnpm allows with a
warning. Rejected: sites installing the admin beside core, Payload's model,
which suits a UI package that no consumer code joins; and an `@admin/*` alias,
which the site's Vite would have to register too, in a build where the site may
already use that name.

**The browser-safe surface is `astromech/shared`, and a bundle test checks
it.** `src/exports/shared.ts` names each browser-safe value the admin reads, and
the admin reaches core only through it, `astromech/fetch` and type-only imports
from `astromech`; a lint rule refuses any `@/` import and any other
`astromech/*` subpath from `packages/admin/src/`. `packages/astromech/tests/exports/shared-browser.test.ts`
bundles the two entries for the browser and fails on a Node builtin, or on a
core file outside `fields/`, `utilities/`, `errors/`, `types/`, the
`*.shared.ts` files and the fetch client. A package boundary does not give that
check by itself: in Directus issue 26613, subpath exports did not stop
`node:assert` reaching the browser, because nothing checked what was added to
the shared package. There is no `browser` export condition. On `./shared` it
changes nothing, and on `.` the Cloudflare server build may resolve it and get
the browser subset. Rejected: a `@astromech/shared` package, which adds a third
publishable unit and, as Directus shows, does not enforce itself; a `browser`
condition, for the reason above; and lint rules policing the `*.shared.ts`
suffix, which check a filename rather than what the bundle reaches.

**Every entry type persists through a repository, and the default is named for
its storage.** The default backend is `createEntriesTableRepository` in
`entries/repository/entries-table.ts`; a plugin gives a type its own table with
`tableRepository`. "Custom table" is the WordPress term for plugin data outside
the shared posts table, so it needs no teaching. Rejected: "table-backed type"
(implies a second kind of thing, when every entry type is backed by a table);
"built-in repository" ("built-in" means ships-with-core, and both repositories
ship with core); `default.ts` / `createDefaultEntryRepository` (greps badly and
collides with default exports, and only reads as "default" from inside the
registry).

**No custom-built repositories.** `EntryRepository` is an internal seam between
the entries service and its persistence, not an extension point; `tableRepository`
is the only supported way to give a type its own storage. `EntryType['repository']`
is typed to the branded `CustomTableRepository` (the class `tableRepository`
returns, nominal through a private member), so a structural implementation no
longer type-checks. Rejected: publishing `EntryRepository` as a public adapter
surface — a compatibility promise on an internal contract, for a use case nothing
needs.

**Only entry types take storage of their own.** `tableRepository` gives an entry
type its own table, because entry types are what sites and plugins declare in
open-ended numbers, and a plugin's own records (form submissions, redirects)
belong in a table it owns, as a WordPress plugin keeps a custom table. Users,
media, settings and notifications read and write core's tables directly. Users
are the tables Better Auth signs in against, so another store for them would
have to satisfy Better Auth as well as core. Media already has its seam where the
bytes live: a `StorageDriver` puts files on the filesystem, R2 or S3, and the
record stays in core so relationships and "used by" can index it. Payload's
storage adapters and Strapi's upload providers draw the same line. Rejected: a
repository seam on every content module, four more internal contracts that no
caller has asked for.

**Every id in the relationships index is unique across resources, custom tables
included.** Both sides of the index rely on it: a source's edges are replaced by
its id and kind, and `findByTarget` and `incomingRelationships` match on
`targetId` alone. Entries, media and custom-table rows take ULIDs and users take
UUIDs, so `tableRepository` refuses an `idColumn` not declared with `col.id()`.
Rejected: adding `sourceType` to the index key, which fixes sources but not
targets and puts a nullable column in the primary key.

**An entry's type is part of its address.** `EntryRepository.get` and
`anyLocale` take the type with the id, and the entries-table repository answers
null for a row of another type, so a by-id operation addressed at the wrong type
throws `EntryNotFoundError` and REST answers 404. Payload and Strapi answer the
same way for an id from another collection, since each collection is its own
table. `tableRepository` holds one type, so it ignores the field. Rejected:
checking the type after the read and throwing a mismatch error, which put the
check in every by-id operation, answered REST with a 500, and told the caller
which type the id belongs to; and making `type` optional, which only mattered
while `EntryRepository` was expected to have implementors outside core.

## AI and the assistant

**AI is an optional core capability that hands out a model.** `src/ai/` sits
beside `email/` and `cron/` with `required: false` and exposes only
`getAiModels()`; consumers call the AI SDK's generation functions themselves. It
is in core rather than the assistant plugin because the plugin boundary would put
it out of reach of other plugins. `AiConfig.model` is
`Exclude<LanguageModel, string>`, because `wrapLanguageModel` cannot wrap a
gateway string, and the live model travels through boot, never through the JSON
virtual config. The chokepoint survives because boot stores wrapped instances.
Rejected: a `rewrite()`-style facade (the removed `ContentProvider` port's
failure mode), and a second provider-agnostic layer.

**Built on Vercel's AI SDK**, not `@anthropic-ai/sdk` (vendor-locked, no
`wrapLanguageModel`), not LangChain JS or Mastra (agent frameworks at the wrong
altitude), not LlamaIndex.TS (RAG-first). The cost accepted is roughly three
breaking majors a year, kept off the plugin surface. The assistant still refuses
non-Anthropic models, because tool search with deferred loading has no
provider-neutral spelling.

**The assistant transcript carries Anthropic content blocks verbatim in both
directions**, filtered only at render, because resuming a paused `tool_use` needs
server-minted ids and unmodified `thinking` blocks. Errors are separate
`{ kind: 'message' | 'error' }` drawer entries, not blocks. Rejected: the AI
SDK's UIMessage/ModelMessage split, and a hand-written local block union.

**The assistant keeps one resumable session per user, replaced on new chat** —
not a browsable library, which brings an unbounded table, a retention policy and
a cross-user disclosure question. "What did the assistant do to my site" belongs
to an audit trail at the `scopedServices` choke point. Rejected: storing the
acting role on the session row, a second source of truth.

**An approval is a server-held row, not a value in the transcript.** A mutating
call pauses into `plugin_assistant_approvals` (user id, `tool_use` id, method,
arguments), is approved by a separate authenticated request, and executes from
the row's stored arguments — so a rewritten transcript cannot change what runs.
Rejected: reusing `policies/confirmation.ts` (the model answers its own
question), and HMAC-signing the paused turn (no replay protection without server
state).

**The assistant loop runs on `streamText` and keeps its own approval gate.** A
mutating tool declares no `execute`, and that loop halt is the gate.
`smoothStream` is banned: it drops reasoning `providerMetadata` into the stored
transcript. Rejected: the AI SDK's built-in tool approvals, because approved
arguments are re-read from client-posted history and
`experimental_toolApprovalSecret` gives neither replay protection nor user
binding.

**Rich text crosses every boundary as HTML**, through `renderRichText` and
`parseRichText` over one ProseMirror extension set. `parseRichText` throws rather
than returning empty, because it is a write path. Rejected: segments (cannot
express structural change, no cross-block context), markdown (loses a link's
`target`, `rel` and `class`), raw ProseMirror JSON (private format, verbose, and
models cannot produce it), and `@tiptap/html` (needs `window`, a runtime
`happy-dom` peer, and a duplicate `@tiptap/core`). The trade: structure
preservation on translate is prompt plus human review, not a guarantee.

## Product shape

**Globals are content, config is code, secrets are env-only, and core ships no
settings page.** Runtime config and secrets live in `astromech.config.ts` and
`.env`; editor-owned site-wide values are globals, declared with `defineGlobal`
and stored in the `globals` tables. `settings` holds only the naked `plugin:*`
key-value class: no fields, no locales, no statuses. Rejected: a WordPress-style
General Settings page, and admin-editable secrets.

**Form notifications are one `notifications` blocks field, and spam protection is
an open `SpamProvider` contract** with `turnstile()` and `recaptcha()` factories,
so a site can supply its own. There is no separate confirmation concept: an
`{{email}}` merge tag in `to` decides the recipient. Rejected: a repeater, which
cannot vary its shape per notification kind, and an internal-only spam registry.

## Toolchain

**The Node floor is 22.13**, declared by all eight published packages, with
`target: "node22"` in tsup and `@types/node` on `^22`. pnpm 11 requires it, and
an untested range is a promise nothing backs. CI runs the floor and the Active
LTS (22 and 24) for Test and Boot; lint, typecheck and build run on 24 alone,
since their output does not vary by runtime. `.nvmrc` names 24. Rejected: an
unverified `>=20.0.0`, and relying on peer-dependency inheritance for the floor.

**Core's and the admin's tests share one module graph per worker.** vitest's default `forks`
pool rebuilt the graph for every one of 222 files, spending 329 seconds of
worker CPU on imports against 122 running test bodies, so the suite runs
`pool: 'threads'` with `isolate: false` and a `tests/_support/isolated-tests.ts`
list of files that opt back into per-file isolation. Threads alone, isolation
kept, took the run from 61s to 48s; dropping isolation took it to 32s. Six files
failed without isolation, every one a `vi.mock` of a module another file had
already imported. Each package's list holds every file that mocks a module,
stubs a global or writes a shared global, not only the ones that fail today,
because a leaked mock can as easily make an unrelated test pass for the wrong
reason as fail. Each package's `tests/isolation-list.test.ts` runs the same
check, `packages/astromech/tests/_support/isolation-check.ts`, over its own
tree, and fails when its list and its files disagree.
Rejected: vitest's documented `*.non-isolated.test.ts` suffix, which inverts the
default the wrong way round when 183 of 222 files are safe; `deps.optimizer.ssr`,
measured slower at 65s; and folding the three package suites into one root
workspace, which matched three separate invocations to within a second and broke
`tests/integrations/cloudflare/d1-local-emulation.test.ts`, which finds
`packages/astromech/wrangler.jsonc` from the working directory.

**Coverage thresholds are per directory and only ever raised.** Each top-level
directory of `packages/astromech/src` has its own lines, functions, branches and
statements threshold in `packages/astromech/vitest.config.ts`, set one below what
it measures, and a change that raises a directory's coverage raises its
threshold. Rejected: one global number, because an average hides a directory
near zero behind well-covered ones.

## Reserved words

These words are taken. Using one for something else costs a reader more than a
plain name would: they arrive with the wrong model and have to unlearn it.

- **driver** — a pluggable backend owning a connection to an external system
  (`DatabaseDriver`, `StorageDriver`, `EmailDriver`). Not "adapter", which is
  reserved for reshaping a mismatched interface internally.
- **service, method, client, API** — one noun per role, never reused. A service
  is a module's callable operations, a method is one operation, a client is an
  assembled consumer object (`astromechClient`), and API means the HTTP surface
  alone. Wire names keep theirs: `entries.publish`, `AstromechApiError`.
  Rejected: reviving "SDK", and bare module exports.
- **storage** — file and blob storage, nothing else. Database access is a
  **repository** (`createXRepository`, `XRepository`, `EntryRow`). Rejected:
  `store`, `persistence`, and renaming the file side to `blob/`.
- **encoded** — a value's form at the driver boundary (`EncodedData`,
  `EncodedCellBase`); the declared SQL type is **columnType**. Rejected: `column`
  (taken), and Drizzle's `driverParam` (reads backwards for a select cell).
- **access** — permission, and nothing else.
- **resource** — the superordinate noun for the four field-bearing things: entry,
  global, user, media item. The document validators are resource
  validators. Rejected: `record` (database-flavoured, already refused for
  entries), and `document` (collides with a ProseMirror doc).
- **module** — everything under `src/`; the six business ones are the content
  modules, and the shelf below them has no group name. Rejected: "domains" (DDD
  bounded-context freight), "infrastructure", "primitives", and "ports" for the
  `PluginContext` members.
- **layout field** — the presentational half of the field types (`section`,
  `tabs`, `tab`, `accordion`), after Payload. Data-bearing nesting types are just
  nested fields. Rejected: "chrome" and "container" as category words.
- **merge tag** — a `{{token}}` in a form email. Rejected: "placeholder", taken
  by a field's input hint.
- **policies/** — Laravel and Pundit-style authorization policies, over
  `guards/`: NestJS `canActivate` guards misdescribe the advisory and structural
  ones, and `policies/` pairs with `permissions/`.
- **tables.ts** — `defineTable` tables live in `<module>/tables.ts`, plural even
  for a single table, and a plugin's ship from `src/tables/` published as
  `./tables`. **schema.ts** means Zod request validation only, so a module
  without validation has no `schema.ts`. Rejected: `schema/` for descriptors,
  ambiguous with Zod schemas.
- **type** — an entry type's identifier inside `entries/`. Rejected: `typeName`
  (inaccurate for a qualified id like `redirects/redirect`), and `typeId`
  (redundant in-domain).
- **or** — the boolean combinator in a repository `where` clause, so no table may
  declare a column called `or`. The compiler reads every other key as a column,
  which would shadow it; `createRepository` throws at construction rather than
  letting a query silently drop the filter.

A public subpath names its source directory (`astromech/database/*`,
`astromech/media/image/*`). `astromech/ui` is the one exception, because "ui" is
what a plugin author types.
