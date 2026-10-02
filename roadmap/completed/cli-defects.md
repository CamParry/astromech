# CLI defects found by the stage 5 tests

Found by the command tests added in stage 5 of
[test-suite-review](../completed/test-suite-review.md), under
`packages/astromech/tests/transport/cli/commands/`. The two tested ones are
expected failures (`it.fails`) until fixed. Command sources are in
`packages/astromech/src/transport/cli/commands/`.

- [x] `db:status` never lists a pending migration: it reads only the
      `kysely_migration` table, not the migrations folder, so a migration that
      was generated but not applied does not appear. Tested.
- [x] `db:status` turns any error into "No migrations table found. Run db:init
      first." and still exits 0.
- [x] `db:generate` writes a baseline without the `// ── <table> ──` banners,
      and `db:rebaseline` refuses any baseline without them. A site whose
      chain began with `db:generate` cannot rebaseline without adding a banner
      per table by hand; `apps/docs/data/migrations.md` describes the refusal
      but not this gap. Tested.
- [x] `db:generate`'s description says "core + plugin schemas", but it
      generates the core tables only.
- [x] `methods` prints `entries.create` without the entry type, and
      `--filter <type>` matches nothing, because the filter reads only the
      method name.
- [x] `validate` prints "1 validation failures".
- [x] `generate:manifest` and `generate:types` open the database client through
      `registerDrivers`, though they never query it.
