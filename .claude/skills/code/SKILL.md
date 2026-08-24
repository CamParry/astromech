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
- **One `validate` per layer.** A field type's own check and the author's whole-resource function are both `validate`. The Zod wrapper over request input is `parseInput` in `errors/validation.ts`; `parseFields` throws and `safeParseFields` returns reports. `parse` keeps its verb — not `validateFields`, not `prepareFields`.
- **`[Astromech]` is a log device.** It lives in `utilities/log.ts` and never in an error message. A thrown error identifies itself by `AstromechError.name`, and a wire-mapped error carries a clean message, so the marker cannot leak into an HTTP body.
- **The lookup verbs are fixed.** `get*` returns the thing and throws when it is absent (`getConfig`), with no `OrThrow` suffix — that suffix belongs to the `registry.ts` primitive, not to callers built on it. `resolve*` returns the thing or `undefined` (`resolveEntryType`). `assert*` returns `void`, matching TypeScript's own `asserts x is T`. `require*` is reserved for middleware (`requireAuth`). `operations/get.ts` `getEntry` returning `null` is the one exception, because a missing entry on the public read path is a 404 rather than a fault.
- **Watch the generic suffixes, don't ban them.** `handler`, `engine`, `service`, `util`, `helper`, `manager` are real ecosystem words and this codebase already uses several — `handler` for a request handler, `@astromech/schema-engine` for a body of core machinery, `utilities/` and `support/` for genuinely miscellaneous small functions. Use them where they carry their normal meaning. Be wary only of reaching for one because the thing resists a more specific name; when a `Manager` or `Helper` would sit next to a name that actually describes the work, prefer the specific one.

## Operation signatures

The functions under `<module>/operations/` follow two rules, so any one of them
is guessable from any other.

- **Verb plus noun, and the noun carries plurality.** `createEntry`, `getUser`,
  `queryMedia`, `updateEntries`, `listEntryVersions`. A function acting on one
  row names the singular; one taking `ids` or returning a list names the plural.
  The service object keys stay short (`app.entries.create`), so the object binds
  `create: createEntry` rather than using shorthand.
- **The record is one nested object; addressing sits at the top level.**
  `createEntry({ type, data })`, `updateEntries({ type, ids, data })`,
  `getUser({ id })`. The key is `data` unless a more specific word says what the
  object does, which is true of `duplicate`'s `overrides` and `settings.set`'s
  `value` and nowhere else.

A REST route keeps a flat body under this: the route spec declares
`bodyKey: 'data'` and the generated client sends that key alone.

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

- **A doc block above every exported function, type, and the file itself.** Write it as a JSDoc `/** … */` block, not a run of `//` lines. This is open-source; a reader needs to know what each public thing does. Private local helpers may skip the block when the name already says it.
- **`//` is for inline notes only.** Don't write a file header, type doc, or function doc as a run of `//` lines.
- **Three lines of text maximum**, file headers included. This is a hard cap: content that overflows (cross-references, layer models, prior art) belongs in `ARCHITECTURE.md` or `DECISIONS.md`, so trim it out rather than relocating it into a longer header.
- Say what it does and where it fits. **Why only when the code would otherwise read as wrong.**
- Inline comments only for non-obvious behaviour. Never restate the code.
- **No section banners.** No `// ====`, `// ----`, or any ruled divider used to label a region of a file. A file that feels like it needs internal signposts wants splitting, not banners.
- **No flair, no rhetorical emphasis** ("this is the whole point", "THIS IS THE ONLY…").
- **No history, no rejected alternatives, no naming justifications.** Established naming needs no defence in a comment; put the record in `DECISIONS.md`.

## Data access (repository pattern)

- **The DB-access unit is a _repository_.** Name `createXRepository`, type `XRepository`, never `createXStorage`. `storage` means file/blob storage only.
- **A `defineTable` / `definePluginTable` export is named `<noun>Table`** — `entriesTable`, `cronTable`, `submissionsTable`. The noun matches the SQL table name; the suffix keeps the table distinct from the module and its service. Row types stay `EntryRow` / `NewEntryRow`.
- **A repository is the only place `getDb` or a Kysely query appears.** Services, operations, jobs, and helpers call a repository — never raw queries.
- Repositories are **factory functions** closing over the db handle: `createUserRepository(db) => ({ … })`. The one class is `TableRepository`, the pluggable `EntryRepository` implementation.
- Business logic is split **operations-per-file** (`operations/create.ts`, …) wrapping the repository; shared per-module helpers live in `<module>/internal/`.
- Module-local data → `<module>/repository/`. Cross-module subsystems (e.g. relationships, spanning entry/user/media) → `database/repository/`, composed by the services that need them.
- `<module>/repository/` (DB access) is a different concept from top-level `storage/` (media binary/blob drivers), and the two words are kept apart deliberately.

## Commits

Conventional commits: `feat:`, `fix:`, `refactor:`
