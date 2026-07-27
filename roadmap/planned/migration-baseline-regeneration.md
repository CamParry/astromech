# Migration baseline regeneration (`db:rebaseline`)

Make the pre-release freedom to rewrite migration history an explicit,
revocable command instead of a hand-edit.

## The problem

`apps/demo/migrations/0000_baseline.ts` is partly emitter output (the
descriptor-backed tables) and partly hand-authored (the 4 better-auth tables and
2 foreign plugin tables, which have no descriptors). Because it is a committed
file, a change to the DDL **renderer** — as opposed to a change to a descriptor —
leaves it stale, and the only way to propagate that change is to edit history.

That happened during step 6: naming foreign-key constraints altered the rendered
`CREATE TABLE` for every table with an FK, so the 12 `FOREIGN KEY` lines in the
baseline were hand-edited to match.

The underlying gap: **rendered DDL carries state the snapshot does not record.**
`SnapshotForeignKey` has no `name`, so the differ structurally cannot emit a
migration for a renderer-level change — it isn't a diff, it's a re-render. Today
that costs nothing (nothing is deployed, `db:init` builds from scratch, and the
parity test catches the divergence immediately). Once anything ships, editing a
migration is illegal, and this class of change becomes a breaking one.

## Why not just put the names in the snapshot

Considered and rejected for now. FK constraint names derive deterministically
from `<table>_<column>_fkey`, so recording them buys nothing except the ability
to diff them — and it costs a snapshot-format change plus churn on every
existing chain. The names are a rendering detail; the snapshot should stay a
record of *schema state*.

## The shape

- `astromech db:rebaseline` — re-emit the descriptor-backed sections of
  `0000_baseline.ts` from the current descriptors and renderer, leaving the
  hand-authored "foreign tables" section untouched, then rewrite
  `snapshot.json` to match.
- Refuse to run when the chain has more than the baseline, or gate it behind an
  explicit flag: rebaselining a chain that others have applied is the thing this
  command must not quietly enable.
- Make the pre-release licence explicit and dated — a note at the top of the
  baseline saying rewriting is legal until first release, so the habit doesn't
  outlive the circumstance that justified it.

## Why it isn't urgent

Nothing is deployed. The parity test (`tests/db/baseline-ddl-parity.test.ts`)
already fails loudly whenever the baseline and the descriptors disagree, so the
divergence can't go unnoticed — it just has to be fixed by hand. This becomes
worth building before the first release, or the first time a renderer change is
more than a dozen lines to patch.

## Related

- `roadmap/in-progress/table-definition-system.md` — the generator this extends.
- `apps/docs/data/migrations.md` — the hand-authored-ops escape hatch, which
  solves the adjacent problem (transitions the differ refuses) and deliberately
  does **not** solve this one: ops append a migration, they don't rewrite one.
