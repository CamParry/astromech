---
milestone: 1.0
---

# Two test files race on the shared local D1 database

`packages/astromech/tests/integrations/cloudflare/d1-local-emulation.test.ts`
drops `kysely_migration` and the other tables it owns before each test, in the
local D1 state wrangler keeps under `packages/astromech/.wrangler/state`.
`packages/astromech/tests/transport/cli/commands/index.test.ts` ("exits once a
command that resolved a Cloudflare binding finishes") runs a `db:init` child
that migrates the same database. When vitest runs the two files at once, the
drop can land between Kysely creating `kysely_migration` and reading it, and the
CLI test fails with `D1_ERROR: no such table: kysely_migration`. Seen once in a
local `verify:fast` on 2026-10-06; the rerun passed.

## Work

- [ ] Give one of the two files its own wrangler persist path, so neither sees
      the other's tables. Prefer that over running them one after the other,
      which hides the shared state rather than removing it.
