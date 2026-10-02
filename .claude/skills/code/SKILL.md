---
name: code
description: TypeScript coding standards and style rules for Astromech. Use when writing, editing, or reviewing any TypeScript or React code. For CSS, use the css skill instead.
user-invocable: false
---

## Naming

Names are not a place to be creative. Before naming anything, find what this exact thing is already called in TypeScript, in a CMS (Payload, Strapi, Sanity, Directus), in an open-source web library, or in the Astro / TanStack / Hono / Drizzle stack, and use that. If you can't recall a convention, look one up. Concept and terminology naming is in `AGENTS.md`.

- **Casing:** `camelCase` values and functions · `PascalCase` types and React components · `SCREAMING_SNAKE_CASE` true constants and env vars · `kebab-case` files and directories · whatever the wire format already uses for API fields and DB columns.
- **Follow the conventions of the world the code lives in.** Server code reads like Node/Hono: `createX`, `getX`, `listX`, `handler`, `middleware`, `options`, `req`/`res`. React code reads like React: `useX` hooks, `onX` handler props, `isX`/`hasX` booleans, `XProvider`, `children`. Don't carry server idiom into a component or React idiom into a service.
- **A function name says what it does, in a verb.** `resolveContentLocale`, `renderRichText`, `createStagedEntry` — not `handleData`, `processStuff`, `contentHelper`. If the verb is hard to pick, the function is doing more than one thing.
- **Be consistent across the codebase before being clever in one file.** If neighbouring code says `entry`, don't introduce `record`, `doc`, or `item` for the same concept. One concept, one word, everywhere.
- **Spell it out.** `config` and `id` are fine because everyone reads them; `cfg`, `mgr`, `svc`, `tmp2` are not. Length costs nothing next to a name a reader has to decode.
- **Acronyms are title-case, whatever their length.** `AiConfig`, `useAiContext`, `UiProvider`, `UrlBuilder`, `HttpClient` — no carve-out for two letters, because `Id` is already title-case in 112 identifiers. Platform globals (`URL`), third-party keys and `SCREAMING_SNAKE` constants are unaffected.
- **A `defineX` factory returns an `X`.** `Descriptor` and `Definition` are not suffixes: `defineTable` returns a `Table`, `defineFieldType` a `FieldType`. Derived forms take an existing prefix — `ResolvedConfig`, `RegisteredPlugin`.
- **One `validate` per layer.** A field type's own check and the author's whole-resource function are both `validate`. The Zod wrapper over request input is `parseInput` in `errors/validation.ts`; `parseFields` throws and `safeParseFields` returns reports. `parse` keeps its verb — not `validateFields`. `prepareFields` (`content/prepare-fields.ts`) is the write path around the parse: it merges, parses and prunes the fields a write stores.
- **`[Astromech]` is a log device.** It lives in `utilities/log.ts` and never in an error message. A thrown error identifies itself by `AstromechError.name`, and a wire-mapped error carries a clean message, so the marker cannot leak into an HTTP body.
- **The lookup verbs are fixed.** `get*` returns the thing and throws when it is absent (`getConfig`), with no `OrThrow` suffix — that suffix belongs to the `registry.ts` primitive, not to callers built on it. `resolve*` returns the thing or `undefined` (`resolveEntryType`). `find*` returns the thing or `null`, for a database read (a repository's `findOne`, after Prisma's `findUnique` and Payload's `find`). `assert*` returns `void`, matching TypeScript's own `asserts x is T`. A call made only for its throw is an `assert*`, never a `get*` whose result goes unused (`DECISIONS.md`, "A lookup's result is used"). `require*` is reserved for middleware (`requireAuth`). The public reads `getEntry` (`methods/get.ts`), `getCurrentUser` and `getCurrentRole` return `null`, because a missing entry on the public read path is a 404 rather than a fault, and a request may have no user.
- **Watch the generic suffixes, don't ban them.** `handler`, `engine`, `service`, `util`, `helper`, `manager` are real ecosystem words and this codebase already uses several — `handler` for a request handler, `@astromech/schema-engine` for a body of core machinery, `utilities/` and `support/` for genuinely miscellaneous small functions. Use them where they carry their normal meaning. Be wary only of reaching for one because the thing resists a more specific name; when a `Manager` or `Helper` would sit next to a name that actually describes the work, prefer the specific one.

## Service method files

One method per file under `<module>/methods/`, every file the same shape, so
reading one teaches the rest. `users/methods/create.ts` and
`users/methods/update.ts` are the reference.

- **Layout.** Imports; the method's doc comment; the exported
  `defineServiceMethod` call, named `<verbNoun>`; then any private helper the
  handler uses. No file header and no other export: a helper another file
  needs lives in `<module>/internal/` or `content/`. An `internal/` file follows
  the same comment rule: a doc comment per export, no file header.
- **Declaration keys in this order:** `summary`, `input`, `binaryInput`,
  `output`, `access` (or `sessionScoped`), `requires`, `mutates`,
  `destructive`, `idempotent`, `handler`. A key needs no comment when its
  contract type documents it (`binaryInput`).
- **`input` is inline**: `z.strictObject({ … })` over the module's `schema.ts`
  or shared keys from `content/`. No per-method `*Input` builder. A value
  checked against config (a role, a locale) is checked in the schema
  (`roleSlugSchema`), not the handler.
- **`access` is a permission string** (`'users:create'`). When the permission
  depends on the call, such as an entry's `type` or a global's `key`, it is the
  module's rule from `<module>/internal/access.ts`, named `<resource>Access`:
  `entryAccess('create')`.
- **The return type is annotated** with the resource type (`UserResource`), or
  the public type where there is no resource (`UserVersion`).
- **The handler runs in this order**, skipping steps it has no use for, with a
  blank line between steps and none within one:
    1. Inputs: destructure `params` (and `data`), then
       `const { config, user } = ctx`, then `const userId = user?.id ?? null`,
       then values derived from config. The requested locale stays
       `params.locale`; the resolved one is `locale`. One value per line; no
       call nested in a call.
    2. Load and check: read the rows the write needs, then throw not-found or a
       rule error (`assertKeepsAnAdmin`).
    3. Prepare: build what is written (`prepareFields`, slug, hash). Slow work
       stays outside the transaction.
    4. The before hook. A hook that may change the data runs before the
       prepare step instead, with a one-line note saying so.
    5. The writes, in one `transaction` when they touch more than one table,
       even through one repository call.
    6. The after hook.
    7. Return.
       A handler that only forwards (a batch method, a status change) delegates
       to one function in `<module>/internal/`, which keeps the same order. A
       batch prepares each item inside its transaction, so a per-item error
       carries its id.
- **Comments:** the declaration's doc comment says what the method does beyond
  its `summary`, and reads on its own. Inside the handler, a `//` note only
  where the code would otherwise read as wrong. Three lines each at most.
  Don't explain why writes share a transaction, what a named helper does, or
  what `summary` says.

## Method signatures

The handlers under `<module>/methods/` follow two rules, so any one of them
is guessable from any other.

- **Verb plus noun, and the noun carries plurality.** `createEntry`, `getUser`,
  `queryMedia`, `updateEntries`, `listEntryVersions`. A function acting on one
  row names the singular; one taking `ids` or returning a list names the plural.
  The service object keys stay short (`app.entries.create`), so the object binds
  `create: createEntry` rather than using shorthand.
- **The record is one nested object; addressing sits at the top level.**
  `createEntry({ type, data })`, `updateEntries({ type, ids, data })`,
  `getUser({ id })`. The key is `data` unless a more specific word says what the
  object does, which is true of `duplicate`'s `overrides` and nowhere else.

- **`defineService` returns a `ServiceDefinition`, not the service.**
  `XService` in `types/services.ts` is the bound interface a caller holds, and
  `definition.bind(ctx)` produces it. Only `createServices`
  (`app-context/services.ts`) binds; everything else reads its handle.

- **A handler never re-parses its own `input`.** `defineService.bind()` has
  already parsed it, on every call path. Parse only a slot the method's schema
  cannot express, such as an entry type's own create schema.

- **A handler's parameter is inferred from `input`, never annotated.** The
  schema is the source of both input types: the handler receives `z.output`,
  and `z.input` is what a caller passes and what the domain input types in
  `types/services.ts` are declared as. Annotate the return type only.

- **Every core method declares `output`.** `bind()` parses the handler's result
  through it, so a handler returns the resource (`UserResource`) and a caller
  gets the public type (`User`), which `types/domain.ts` infers from the
  resource's output schema in its `schema.ts`. There is no `toX` mapper. A
  resource that leaves core another way (a hook payload, the session's user, a
  field validator's record) goes through `parseOutput` with the same schema.

- **An output schema strips; it never transforms.** Plain `z.object`s, with no
  `.transform()` or `.pipe()`: the resource already carries the public names,
  and a value the public shape computes (media's `url`) is computed in the
  repository decoder or the handler.

- **An output schema has three tiers.** `fields`, and any other stored JSON, is
  `unparsedJsonObject`, typed without being walked. A nullable or optional value
  is `withFallback(schema, null)` (or `undefined`), which substitutes and logs,
  and which the OpenAPI document shows as `schema`. Never a bare `.catch`.
  Everything else is plain, so a bad value fails the call.

- **Share keys, don't copy them.** Keys several resources carry (`auditKeys`,
  `publishedAtKey`) and the version shapes live in `content/schema.ts`. A
  version's `snapshot` is the resource's output schema narrowed with `.pick()`
  to the keys a version stores, and `versionSchema(name, snapshot)` adds the
  shared metadata.

- **A version is addressed by number.** Version methods take the resource's
  address, the locale and `version`, never the version row's id, which stays
  internal like the content row's.

A REST route keeps a flat body under this: the route spec declares
`bodyKey: 'data'` and the generated client sends that key alone.

## Resources

Entries, globals, media and users share their behaviour through `content/`, read
off `RESOURCE_CONFIG` in `content/resources.ts`.

- **A caller names the resource.** A `content/` helper takes `resource: 'user'`
  and looks up its resource config itself; only `content/` imports
  `RESOURCE_CONFIG` (lint-enforced). A single member a module needs gets a named
  accessor in `content/resources.ts`.

- **A helper a second resource needs moves to `content/`.** Copying it into the
  second module is how the four drifted apart.
- **A "mirrors …" comment is a defect**, not documentation: share the code, or
  say in one line why this resource differs.
- **A new resource-wide rule gets a case in
  `tests/content/resource-conformance.test.ts`**, or in the `resource-*.test.ts`
  table beside it for its topic, each of which runs its checks over
  `RESOURCE_TYPES`.

## File ordering

- **The main thing comes first.** A file's primary export — the service builder, the component, the entry-type config — goes at the top, and its private helpers follow below it. Never stack helpers above the payoff.
- Function declarations hoist, so their order is free.
- `const` does **not** hoist. A module-level `const` built eagerly from a helper (`export const formEntryType = { fields: [...fieldBlocks()] }`) throws a TDZ `ReferenceError` if that helper reads a `const` declared lower down. Turn the data into a function and keep any lookup table it reads above the eager object.
- A `const` only read inside a deferred body — a handler, a factory's return — is safe below the main export.

## Rules

- Never use `any`,
- `type` over `interface`
- `import type` for type-only imports
- Named exports only
- No `enum` — use union types: `type Status = 'draft' | 'published'`
- Optional presence: `!== undefined`, not truthiness (`false`/`0`/`''` are valid)
- Ignored promises: prefix with `void` (e.g. `void navigate(...)`)
- Comments: see below
- No `style={{...}}` — use a BEM modifier class
- Imports: `@/` aliases only, UI components from `@/components/ui/index.js`

## Comments

- **Method files follow the tighter rule** under "Service method files".
- **A doc block above every exported function, type, and the file itself.** Write it as a JSDoc `/** … */` block, not a run of `//` lines. This is open-source; a reader needs to know what each public thing does. Private local helpers may skip the block when the name already says it.
- **`//` is for inline notes only.** Don't write a file header, type doc, or function doc as a run of `//` lines.
- **Three lines of text maximum**, file headers included. This is a hard cap: content that overflows (cross-references, layer models, prior art) belongs in `ARCHITECTURE.md` or `DECISIONS.md`, so trim it out rather than relocating it into a longer header.
- Say what it does and where it fits. **Why only when the code would otherwise read as wrong.**
- Inline comments only for non-obvious behaviour. Never restate the code.
- **No section banners.** No `// ====`, `// ----`, or any ruled divider used to label a region of a file. A file that feels like it needs internal signposts wants splitting, not banners.
- **No flair, no rhetorical emphasis** ("this is the whole point", "THIS IS THE ONLY…").
- **No history, no rejected alternatives, no naming justifications.** Established naming needs no defence in a comment; put the record in `DECISIONS.md`. `check:docs` fails on `Phase n`, `Pn/`, `spec §` and "pre-extraction" in a comment, and on a backticked path in a doc comment that no longer resolves.

## Data access (repository pattern)

- **The DB-access unit is a _repository_.** Name `createXRepository`, type `XRepository`, never `createXStorage`. `storage` means file/blob storage only.
- **A `defineTable` / `definePluginTable` export is named `<noun>Table`** — `entriesTable`, `cronTable`, `submissionsTable`. The noun matches the SQL table name; the suffix keeps the table distinct from the module and its service.
- **A repository is the only place `getDb` or a Kysely query appears.** Services, methods, jobs, and helpers call a repository — never raw queries. `createRepository(table)` is called only inside a repository file and in tests.
- **A repository is a module-level object.** The repository file builds it once with a private factory and exports it: `export const userRepository = createUserRepository()`. Callers import it. A test that needs a failure the database cannot produce swaps one method with `vi.spyOn(userRepository, 'findOne')`, and vitest restores every spy before the next test starts; the `testing` skill says when that is the right tool. A service never builds a repository, and never passes it `config` or a `db`: the handle is resolved per call, so a transaction scope reaches it. A plugin is the exception: it builds its `createXRepository(ctx.db)` inside each call, never at module level.
- **Per call on `ctx`, per site from a registry.** The user, role, access and requested locale arrive as arguments. The database, storage and email come from registries. Repositories are imported.
- **A plugin's data lives in the plugin**: its own `definePluginTable` table, a repository from `ctx.db`, and service methods each with `access: { permission }`, with input checked by `parseFields` against its field definitions. Never an entry type. Its admin screens come from an admin resource (`defineAdminResource`).
- **No shared resource base.** `createRepository` is a tool and `createContentRepository` holds only the three-table mechanics (join, decode, staging, versions, content-row writes). Users, media, globals and entries each write their own reads (list, count, sort, search, locale fallback) and hand-pick from the content repository, never spreading it. `resourceRows` stays private.
- **Repository method names are fixed.** Reads: `findOne` (the row or `null`), `findMany`, `count`, `findBy<X>`, `countBy<X>`. Writes: `create`, `update`, `delete`, `upsert`, their `…Many` forms, `updateBy<X>`, `deleteBy<X>`. A resource's `findMany(params)` and `count(params)` take `{ sort, locale, limit, offset }` plus its filters; a fallback read takes `{ fallbackLocale }`. A method keeps a domain verb only when it is a conditional write whose condition is the rule (`claim`, `recordRunAndRelease`, `createIfEmpty`, `expireStale`). Service methods keep their own names (`query`, `get`, `list…`).
- **A single-table repository wraps `createRepository` privately** and exposes named methods only, so an owner filter or a claim cannot be bypassed.
- A core repository module keeps its **factory private** and exports the one object. A plugin exports its factory, because each call builds it from `ctx.db`. No classes.
- Business logic is split **method-per-file** (`methods/create.ts`, …) wrapping the repository.
- **`<module>/internal/` holds helpers two or more of the module's own files share, and nothing outside the module imports it** (lint-enforced). A helper with one caller lives in that caller's file, unless a per-file lint exemption needs it apart; anything another module imports sits at the module root.
- **Row and resource names.** A row is a table row and nothing else: `XTableRow` / `NewXTableRow`, and `XContentRow` for a content table. The decoded join a repository returns is `XResource` (base `Resource`), built by `toXResource` in the repository from `(resourceRow, contentRow, locales)`. Inside a repository, the resource table's own handle is `resourceRows`. No mapper turns a resource into the public type; the method's output schema does.
- A module's repository is `<module>/repository.ts`, or a `<module>/repository/` directory once it needs more than one file. Repositories spanning the resources (relationships, resource existence) live in `content/repository/`. `database/repository/` holds only `createRepository` and its `where` DSL.
- `<module>/repository/` (DB access) is a different concept from top-level `storage/` (media binary/blob drivers), and the two words are kept apart deliberately.

## Commits

Conventional commits: `feat:`, `fix:`, `refactor:`
