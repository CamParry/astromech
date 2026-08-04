---
name: code
description: TypeScript coding standards and style rules for Astromech. Use when writing, editing, or reviewing any TypeScript or React code. For CSS, use the css skill instead.
user-invocable: false
---

## Naming

Names are not a place to be creative. Before naming anything, find what this exact thing is already called in TypeScript, in a CMS (Payload, Strapi, Sanity, Directus), in an open-source web library, or in the Astro / TanStack / Hono / Drizzle stack, and use that. If you can't recall a convention, look one up. Concept and terminology naming is in `CLAUDE.md`.

- **Casing:** `camelCase` values and functions · `PascalCase` types and React components · `SCREAMING_SNAKE_CASE` true constants and env vars · `kebab-case` files and directories · whatever the wire format already uses for API fields and DB columns.
- **Follow the conventions of the world the code lives in.** Server code reads like Node/Hono: `createX`, `getX`, `listX`, `handler`, `middleware`, `options`, `req`/`res`. React code reads like React: `useX` hooks, `onX` handler props, `isX`/`hasX` booleans, `XProvider`, `children`. Don't carry server idiom into a component or React idiom into a service.
- **A function name says what it does, in a verb.** `resolveContentLocale`, `renderRichText`, `createStaged` — not `handleData`, `processStuff`, `contentHelper`. If the verb is hard to pick, the function is doing more than one thing.
- **Be consistent across the codebase before being clever in one file.** If neighbouring code says `entry`, don't introduce `record`, `doc`, or `item` for the same concept. One concept, one word, everywhere.
- **Spell it out.** `config` and `id` are fine because everyone reads them; `cfg`, `mgr`, `svc`, `tmp2` are not. Length costs nothing next to a name a reader has to decode.
- **Watch the generic suffixes, don't ban them.** `handler`, `engine`, `service`, `util`, `helper`, `manager` are real ecosystem words and this codebase already uses several — `handler` for a request handler, `@astromech/schema-engine` for a body of core machinery, `utilities/` and `support/` for genuinely miscellaneous small functions. Use them where they carry their normal meaning. Be wary only of reaching for one because the thing resists a more specific name; when a `Manager` or `Helper` would sit next to a name that actually describes the work, prefer the specific one.

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

- **One short block above every function.** This is open-source — a reader needs to know what each one does.
- **Three lines of text maximum**, file headers included. More only for genuinely complex logic.
- Say what it does and where it fits. **Why only when the code would otherwise read as wrong.**
- Inline comments only for non-obvious behaviour. Never restate the code.
- **No flair, no rhetorical emphasis** ("this is the whole point", "THIS IS THE ONLY…").
- **No history, no rejected alternatives, no naming justifications.** Established naming needs no defence in a comment — put the record in `decisions/`.

## Data access (storage pattern)

- **No repository pattern.** Every DB-touching unit is _storage_. Name `createXStorage`, never `XRepository`.
- **A `defineTable` / `definePluginTable` export is named `<noun>Table`** — `entriesTable`, `cronTable`, `submissionsTable`. The noun matches the SQL table name; the suffix keeps the descriptor distinct from the domain and its service. Row types stay `EntryRow` / `NewEntryRow`.
- **Storage is the only place `getDb` or a Kysely query appears.** Services, operations, jobs, and helpers call storage — never raw queries.
- Storage modules are **factory functions** closing over the db handle: `createEntryStorage(db) => ({ … })`. No storage classes.
- Domain logic is split **operations-per-file** (`operations/create.ts`, …) wrapping storage; shared per-domain helpers live in `<domain>/internal/`.
- Entries-local data → `<domain>/storage/`. Cross-domain subsystems (e.g. relationships, spanning entry/user/media) → `database/storage/`, composed by the services that need them.
- `<domain>/storage/` (DB access) is distinct from top-level `storage/` (media binary/blob drivers). Don't conflate.

## Commits

Conventional commits: `feat:`, `fix:`, `refactor:`
