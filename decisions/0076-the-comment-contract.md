# 0076 — the comment contract: no banners, JSDoc on the public surface

**Date:** 2026-08-20
**Status:** accepted

## Context

The `code` skill has carried a short comment policy for a while (one block per
function, three lines, no flair, no history). The codebase drifted from it in
three ways the policy did not name, so nothing caught the drift.

- **Section banners spread in two variants.** A heavy `// ====` rule and a light
  `// ----` rule both labelled regions of a file (`// ==== Zod schemas ====`).
  An audit found roughly 290 banner blocks across about 85 of 562 source files.
  No single file mixed the two variants, but the codebase as a whole ran both,
  and 471 files used neither, so the pattern was neither universal nor uniform.
- **Block syntax was settled in practice but unwritten.** `/** */` was already
  the dominant style for file headers, type docs, and function docs (440 files).
  `//` carried inline notes and the banners. The split was real but never stated,
  so nothing stopped a header being written as a run of `//` lines.
- **File headers overran the three-line cap.** `database/tables.ts` and
  `entries/visibility.ts` carried headers that embedded cross-references and a
  layer model, duplicating what `ARCHITECTURE.md` and `decisions/` already own.

## Decision

Four rules, added to the `code` skill's Comments section.

- **No section banners.** No `// ====`, no `// ----`, no ruled divider used to
  label a region. A file that feels like it needs internal signposts wants
  splitting, not banners.
- **A doc block on the public surface, `//` for inline notes.** A JSDoc
  `/** … */` block sits above every exported function, exported type, and the
  file itself. A private local helper may skip it when its name already says
  what it does. A file header, type doc, or function doc is never a run of `//`
  lines.
- **Three lines is a hard cap, including file headers.** Content that overflows
  (cross-references, layer models, prior art) belongs in `ARCHITECTURE.md` or
  `decisions/`. Trim it out of the header rather than relocating it into a
  longer one.
- The existing rules stand: say what it does and where it fits, why only when
  the code would otherwise read as wrong, inline comments only for non-obvious
  behaviour, no flair, no history.

## Why banners lose

They are decoration the policy already bans in spirit ("no flair"), and they
earn their keep only in a file long enough to need internal navigation, which is
the file that should have been split. Each one is also upkeep: moving a section
means moving its banner, and the two variants are the visible cost of nobody
owning that upkeep. Removing them costs the reader nothing, because the block
comment above each export already names what follows.

## Relaxing "every function" to the public surface

The old rule asked for a block above every function. Held literally it puts a
comment above a three-line private helper whose name is already the sentence the
comment would write. The rule now targets the exported surface, where an
open-source reader actually needs orientation, and lets a well-named private
helper stand on its name. This narrows the old rule; it does not reverse it.

## Rejected

- **Keep banners, standardise on one variant.** Picking `// ====` and allowing
  it above some file size would formalise the decoration instead of removing it,
  and "above some size" is a threshold nobody would apply consistently. The
  files large enough to tempt a banner are the ones to split.
- **Relocate header overflow into `ARCHITECTURE.md` / `decisions/`.** Tempting,
  but most of the overflow already existed in those files or restated the code
  below it. Moving it wholesale would have created duplicate homes for the same
  fact, which `decisions/0011` rules out. The overflow is dropped, not moved;
  anything genuinely missing from the durable docs is added there on its own.

## Consequences

- The `code` skill's Comments section is rewritten to these rules.
- The roughly 290 banner blocks are removed across the codebase, the overrunning
  headers are trimmed to the cap, and exported functions missing a block get
  one. The sweep runs directory by directory.
- Going forward a header, type doc, or function doc written as `//` lines, or any
  new banner, is a policy violation the skill now names.
