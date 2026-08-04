# 0011 — One question per document, and no history in the map

**Date:** 2026-08-04
**Status:** accepted

The repo's documentation had grown to a handful of markdown files with no stated
contract between them, and it drifted in the way that predicts: `ARCHITECTURE.md`
said "the four first-party plugins" while its own directory map listed five (six
by the time this was written), because the same fact was written in two places
and only one got updated. It also called `specs/` the home of "the canonical
detail" thirty lines before telling the reader never to link to a spec.

## Each file answers one question

`AGENTS.md` (what must I do) · `ARCHITECTURE.md` (where does code live) ·
`TERMINOLOGY.md` (what does this word mean) · `decisions/` (why is it this way) ·
`roadmap/` (what are we building) · `specs/` (how will we build this) ·
`apps/docs/` (how do I use Astromech).

A fact lives in exactly one of them and every other mention is a link. The
contract is written out in the `docs` skill, which loads when markdown is edited.

## The map files carry no history

`ARCHITECTURE.md` and `TERMINOLOGY.md` describe the present and nothing else.
The test is mechanical, which is the point — "was", "used to", "no longer",
"renamed from", "were dissolved", or a date means the sentence is history and
belongs here instead.

This is the rule that does the real work. A map with archaeology in it is a map
nobody edits: the paragraph reads like a story, so a writer adds to it rather
than correcting it, and the map ages into a changelog. Removing history is also
what makes the map short enough to stay accurate.

What was moved out of the map files when this landed, and where it now lives:

- The `core/` / `sdk/` / `api/` dissolution → `roadmap/completed/modular-architecture-refactor.md`.
- The `astromech/plugin-kit` dissolution → `roadmap/completed/plugin-authoring-experience.md`.
- `demo/` and `docs/` moving under `apps/`, and `db/` becoming `database/` → `roadmap/completed/packages-monorepo-restructure.md` and `roadmap/completed/data-layer-storage-api.md`.
- Why `ssr.noExternal` does not fix the plugin runtime boundary → `0007-plugin-core-boundary.md`, which already held it.
- Driver over adapter → `0012-driver-not-adapter.md`, written to catch it.
- `unpublished` having been called `draft`, and the "Phase 14" scheme: dropped. Neither told a reader anything they could act on.

## `check:docs` is the only new machinery

One script resolves every repo-relative link and backticked path in markdown and
fails the gate on a miss. It found eighteen dead references on its first run,
including four links into specs that had been deleted, and three roadmap paths
still naming the directory a feature had moved out of.

It deliberately skips `specs/` and `roadmap/planned/`, which describe files that
do not exist yet, and it resolves `decisions/0003` by numeric prefix so a writer
need not paste a whole slug.

## Rejected

**Frontmatter on roadmap files** (`id`, `status`, `depends_on`), the shape
[Backlog.md](https://github.com/MrLesk/Backlog.md) uses. Status is already the
directory, so a `status:` field would be a second home for the one fact this
model exists to prevent duplicating. The rest is unearned structure for a
single-maintainer repo.

**Spec Kit or Kiro's fixed `requirements.md` / `design.md` / `tasks.md` per
feature.** `roadmap/` plus an ephemeral `specs/` already covers it, and a
mandatory three-file split would mean writing two empty files for most work.

**Keeping `CLAUDE.md` as the primary instruction file.** `AGENTS.md` is the
cross-tool convention, stewarded by the Linux Foundation's Agentic AI Foundation
and read by Codex, Cursor, Copilot, Gemini CLI, Aider and Zed. `CLAUDE.md` is now
a pointer that imports it, so the rules survive a change of tooling. Nested
`AGENTS.md` files at `packages/astromech`, `packages/plugins`, `apps/demo` and
`apps/docs` carry the local traps, and the closest one to the edited file wins.

**Deleting the history outright rather than relocating it.** Some of it is load
bearing: a reader who greps for `sdk/` needs to find out where it went.
