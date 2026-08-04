# Documentation model

Give the repo's markdown a stated contract — one question per document, one home
per fact, no history in the map files — and clean up the drift that not having
one had produced. Rationale and rejected alternatives:
`decisions/0011-documentation-structure.md`.

## The pattern

- [x] `AGENTS.md` at the root as the primary instruction file, with `CLAUDE.md`
      reduced to a pointer that imports it. Cross-tool convention, so the rules
      survive a change of tooling.
- [x] Nested `AGENTS.md` at `packages/astromech`, `packages/plugins`,
      `apps/demo` and `apps/docs`, carrying the traps local to each. The closest
      file to the one being edited wins.
- [x] A `docs` skill holding the full contract: which file answers which
      question, what each may not contain, the decision-record format, and the
      roadmap and backlog rules. Loads when markdown is edited, matching how
      `code`, `ui`, `api` and `css` already work.
- [x] `decisions/README.md` gained an index and a stated metadata block
      (`Date` / `Status` / `Supersedes`).
- [x] `npm run check:docs` — resolves every repo-relative markdown link and every
      backticked path, and fails the gate on a miss. Added to the gate table.

## The cleanup

- [x] Stripped history from `ARCHITECTURE.md` and `TERMINOLOGY.md`, relocating
      anything load-bearing to `decisions/`. Two new records came out of it:
      `0011` for the model itself and `0012` for driver-over-adapter, which had
      been sitting in `TERMINOLOGY.md` as a rationale blockquote.
- [x] Corrected the stale facts the drift had left: four first-party plugins
      became six (`forms` and `authoring` were both missing), and the layer-model
      block gained the `content` and `notifications` domains its own directory
      map already listed.
- [x] Renumbered the duplicate `0007` — the media-browser record became `0010` —
      and updated its references.
- [x] Fixed eighteen unresolved references found by `check:docs`, including four
      links into deleted specs and three roadmap paths still naming the directory
      a feature had moved out of.
- [x] Split the live admin form defects out of `roadmap/backlog.md` into
      `planned/admin-form-defects.md`, so their status can move. Pruned the
      ticked items, and grouped what was left by area.
- [x] Moved two bug-class lessons (`form.state` is a getter, not reactive state;
      seed `useState` from a prop behind a guard) out of the backlog and into the
      `ui` skill, where they apply at the moment someone writes the code.
- [x] Repointed the `code` skill and the `plan` / `feature` / `refactor` commands
      at `AGENTS.md`.

## Known limits

`check:docs` does not check backticked paths inside `decisions/` or
`roadmap/completed/` — both are frozen records that quote paths accurate at the
time of writing, and failing them on an unrelated later rename would tax a
historical document and invite falsifying it. Markdown links are still checked
everywhere, because a link is a promise the reader can click. `specs/` and
`roadmap/planned/` are skipped entirely: they describe files that do not exist
yet.

`npm run format:check` remains red on
`roadmap/completed/plugin-authoring-experience.md`, which predates this work.
Prettier is non-idempotent on that file and `--write` does not fix it; the cause
and what an actual fix needs are in `roadmap/backlog.md`.
