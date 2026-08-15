---
name: docs
description: Documentation conventions for Astromech — which file a fact belongs in, what each one may and may not contain, and how to write an entry. Use when writing or editing any markdown in the repo.
user-invocable: false
---

## The model

Every document answers one question. A fact lives in exactly one file; everywhere else links to it. Restating is how the four-versus-five plugin count happened.

| File                   | Answers                  | Tense          | Lifetime                  |
| ---------------------- | ------------------------ | -------------- | ------------------------- |
| `AGENTS.md` (+ nested) | what must I do           | imperative     | edited in place           |
| `ARCHITECTURE.md`      | where does code live     | present        | edited in place           |
| `TERMINOLOGY.md`       | what does this word mean | present        | edited in place           |
| `decisions/`           | why is it this way       | past           | permanent, append-only    |
| `roadmap/`             | what are we building     | future/present | moves between directories |
| `specs/`               | how will we build this   | future         | deleted on ship           |
| `apps/docs/`           | how do I use Astromech   | present        | edited in place           |

If you can't say which question a paragraph answers, it doesn't have a home yet. Work that out before writing it.

## The map files are a map of the present

`ARCHITECTURE.md` and `TERMINOLOGY.md` describe what is true now, and nothing else. No history, no rationale, no plans.

The test is mechanical: **if a sentence needs "was", "used to", "no longer", "renamed from", "were dissolved", "as of", or a date, it is history.** Delete it, or move it to `decisions/` if the reasoning still has value. A reader who needs to know that `core/` used to exist is reading archaeology; a reader who needs to know what exists now is reading the map, and history in the way costs them.

Two consequences worth stating because they get missed:

- **A term's entry says what it means, not what it replaced.** "Why X and not Y" is a decision record. `TERMINOLOGY.md` may carry a one-line pointer to it, which several entries already do well.
- **Removed things are not documented as removed.** "There is no populate mechanism" earns its place only because callers actively look for one; "`populate` was deleted in the relationships rework" does not.

## Decisions

One file per decision, `NNNN-kebab-title.md`, numbers unique and never reused. Never edited once written — supersede it with a later record and mark the old one.

Open with the metadata block, then the reasoning:

```markdown
# 0011 — Short title in the imperative

**Date:** 2026-08-04
**Status:** accepted
**Supersedes:** 0004 (optional)
```

`Status` is `proposed`, `accepted` or `superseded by NNNN`. Write what was rejected and why, not just what won: the record exists so the choice isn't re-litigated, and that needs the losing options in it. `0004-relationships-as-a-derived-index.md` is the worked example.

Add a line to `decisions/README.md` when you add a record.

## Roadmap

One file per feature. **Status is the directory** (`planned/` → `in-progress/` → `completed/`) and never a field, a heading, or an emoji inside the file. Change status with `git mv`.

`backlog.md` holds unscheduled work that belongs to no single feature: one line each, with a link if there is detail. It is not a bug tracker and not an essay. A known defect in shipped code belongs in the roadmap file for the feature it breaks, where the person picking that feature back up will see it.

Prune it. A ticked item in `backlog.md` is finished work sitting in a list of unfinished work — delete it, or move the reasoning to the feature's roadmap file.

## User docs

`apps/docs/` is written for someone building a site with Astromech. One page, one shape: how-to, reference, or explanation. Every page gets a line in `apps/docs/README.md` saying what it covers.

## Writing

- **Say what is true, not what is impressive.** No "powerful", "seamless", "robust", "comprehensive".
- **One short opening sentence stating what the file holds and what it doesn't.** The next writer uses it to decide whether their paragraph goes here.
- **Link, don't restate.** Reference the canonical file by path.
- **Prefer a sentence to a bullet** where the thought has any connective tissue in it.
- **Paths and identifiers go in backticks.** `check:docs` verifies they resolve, so a typo fails the gate rather than misleading a reader.

## Before you finish

`pnpm run check:docs` must pass. It resolves every repo-relative link and every backticked path in markdown, which is the check that catches a rename nobody propagated.
