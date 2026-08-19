# 0075 — Tables split out of the domain schema file

**Date:** 2026-08-20
**Status:** accepted

Each core domain kept its `defineTable` tables and its Zod request schemas in one
`<domain>/schema.ts`. Two unrelated concerns shared a file, and the file's name
claimed the wider word for what was mostly a table definition. The tables now
live in their own `<domain>/tables.ts`; `schema.ts` keeps only the Zod schemas.

## The moves

| From                              | To                                                     |
| --------------------------------- | ------------------------------------------------------ |
| `users/schema.ts`                 | `users/tables.ts` (tables) + `users/schema.ts` (Zod)   |
| `settings/schema.ts`              | `settings/tables.ts` + `settings/schema.ts` (Zod)      |
| `media/schema.ts`                 | `media/tables.ts` + `media/schema.ts` (Zod)            |
| `entries/schema.ts`               | `entries/tables.ts` + `entries/schema.ts` (Zod)        |
| `notifications/schema.ts`         | `notifications/tables.ts` (table-only; no Zod to keep) |
| `database/schema.ts` (aggregator) | `database/tables.ts`                                   |

A domain that validates no request input (`notifications`) ends up with a
`tables.ts` and no `schema.ts` at all, which is the point: the name now tells you
whether request validation exists.

## `tables.ts`, plural

The file is `tables.ts`, not `table.ts`, even for the single-table domains
(`settings`, `media`, `notifications`). `users` and `entries` each define two and
three tables, so the singular would be wrong there, and the plugin surface
already publishes tables from a `src/tables/` directory — one spelling across the
whole codebase beats a per-domain count.

## What "schema" means now

Splitting the file narrows the word. In a domain, `schema` is request validation
(Zod) and nothing else. The wider "whole shape" sense keeps two homes: the
`astromech/database/schema` public subpath and `@astromech/schema-engine`. This
supersedes the part of `decisions/0001-forms-vocabulary-and-table-directories.md`
and `TERMINOLOGY.md` that let a core `schema.ts` mean "tables plus validation";
`0001`'s tables-directory reasoning otherwise stands.

## The public subpath name does not move

`astromech/database/schema` is still the public subpath for the schema surface.
It is defined by the package `exports` map pointing at
`src/exports/database-schema.ts`, not by the internal filename, so renaming
`src/database/schema.ts` to `src/database/tables.ts` leaves the published name
untouched. Consumers see no change.

## Alternatives

- **Leave the files mixed.** Rejected: the two concerns have different readers
  (the DDL/codec/migration path reads tables; the transport and manifest read Zod)
  and no shared code, so one file only made both harder to find.
- **Rename only the four mixed files, leave the table-only ones as `schema.ts`.**
  Rejected: `schema.ts` would then mean "Zod schemas" in one domain and "a table"
  in the next. A single meaning per name is worth the two extra renames.
