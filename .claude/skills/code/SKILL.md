---
name: code
description: TypeScript coding standards and style rules for Astromech. Use when writing, editing, or reviewing any TypeScript or React code. For CSS, use the css skill instead.
user-invocable: false
---

## Naming

- Files: kebab-case · Types: PascalCase · Functions/variables: camelCase

## Rules

- Never use `any`,
- `type` over `interface`
- `import type` for type-only imports
- Named exports only
- No `enum` — use union types: `type Status = 'draft' | 'published'`
- Optional presence: `!== undefined`, not truthiness (`false`/`0`/`''` are valid)
- Ignored promises: prefix with `void` (e.g. `void navigate(...)`)
- Comments only when logic is non-obvious
- No `style={{...}}` — use a BEM modifier class
- Imports: `@/` aliases only, UI components from `@/components/ui/index.js`

## Data access (storage pattern)

- **No repository pattern.** Every DB-touching unit is _storage_. Name `createXStorage`, never `XRepository`.
- **Storage is the only place drizzle/`getDb` appears.** Services, operations, jobs, and helpers call storage — never raw queries.
- Storage modules are **factory functions** closing over the db handle: `createEntryStorage(db) => ({ … })`. No storage classes.
- Domain logic is split **operations-per-file** (`operations/create.ts`, …) wrapping storage; shared per-domain helpers live in `<domain>/internal/`.
- Entries-local data → `<domain>/storage/`. Cross-domain subsystems (e.g. relationships, spanning entry/user/media) → `database/storage/`, composed by the services that need them.
- `<domain>/storage/` (DB access) is distinct from top-level `storage/` (media binary/blob drivers). Don't conflate.

## Commits

Conventional commits: `feat:`, `fix:`, `refactor:`
