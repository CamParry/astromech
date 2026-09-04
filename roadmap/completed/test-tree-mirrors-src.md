# The test tree mirrors src

`packages/astromech/AGENTS.md` says tests live in `tests/`, mirroring `src/`,
and the root `AGENTS.md` repeats it. Neither is true. This is a rename and a
move, not new tests: the coverage is there, it is filed under names the source
tree stopped using.

## Where the two trees disagree

| In `tests/`                                | Files | What it actually tests                                       |
| ------------------------------------------ | ----: | ------------------------------------------------------------ |
| `services/`                                |    36 | `src/entries`, `media`, `users`, `settings`, `notifications` |
| `db/`                                      |    16 | `src/database/`                                              |
| `images/`                                  |     6 | `src/media/serving/image/`                                   |
| `builders/`                                |     3 | `src/database/define-table.ts` and `src/fields/`             |
| `plugins/{forms,menus,redirects,backups}/` |    11 | four other published packages                                |

`services/` is the sharpest one. `ARCHITECTURE.md` calls those five directories
**the content modules**; each has a `service.ts` inside it, but the layer has
not been called "services" for some time. So `src/entries/` is tested from two
places at once: `tests/entries/` holds five files about the repository and entry
types, `tests/services/entries/` holds twenty about everything else, and nothing
in either name says which belongs where.

**Coverage is not the problem.** `src/users` is reached by 17 test files and
`src/media` by 22 — they are simply not in `tests/users/` or `tests/media/`.
The cost is navigation: a reader who changes `src/settings/` has no way to guess
that its tests are in `tests/services/settings/`, and the mirror rule that would
have told them is written down and wrong.

The four plugin suites are a different problem in the same tree, and the
package-boundary half of it belongs to `./publishing-hygiene.md`.
What belongs here is that `tests/plugins/` mixes them with
`tests/plugins/runtime/`, which
tests core's plugin runtime and is correctly placed.

## The work

- [x] `tests/services/*` splits into `tests/entries/`, `tests/media/`,
      `tests/users/`, `tests/settings/` and `tests/notifications/`, merging with
      the existing `tests/entries/`.
- [x] `tests/db/` becomes `tests/database/`. `tests/images/` moves under
      `tests/media/serving/image/`.
- [x] `tests/builders/` empties into `tests/fields/`: all three files build
      fields and columns from `src/fields/`, none of them a table.
- [x] The four plugin suites move to their own packages
      (`./publishing-hygiene.md` covers the scripts and the
      boundary). `tests/plugins/` keeps only `runtime/`, matching
      `src/plugins/runtime/`.
- [x] Every moved file's `@/` imports keep working, since the alias is rooted at
      `src/`. The relative imports that climb out of the package do not, which
      is the point of moving them.
- [x] Re-read both AGENTS.md claims once the tree matches, and delete the
      parenthetical from the root gate table rather than restating the rule in
      two files.

## Why it was left

Every one of these is a directory that made sense when it was created and was
never renamed with the source. Nothing breaks, so nothing forces it. It is worth
doing in one pass rather than opportunistically, because a half-migrated tree is
harder to navigate than either of the two consistent ones.
