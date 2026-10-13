---
milestone: 1.0
---

# Shorter project docs

`DECISIONS.md` is about 20,000 words in 170 one-paragraph entries, so an agent
that opens it spends about 27k tokens to find one choice. It took 161 commits in
the month to 2026-10-13, all to one file, from sessions running at once. Other
files cite an entry by its quoted title, which nothing checks: 7 of 44 such
citations name a title that no longer exists. `ARCHITECTURE.md` (about 3,000
words) and `TERMINOLOGY.md` (about 1,700) are smaller, but written as prose
where bullets would do.

## Prior art

One file per decision is the common layout: Nygard's
[architecture decision records](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions),
[MADR](https://adr.github.io/madr/), Rust RFCs and Python PEPs. Those records
are never edited; a reversal adds a record that supersedes the old one. This
project reverses choices often, so a superseded record would sit beside its
replacement for an agent to read as current. Here a decision file is current
state and is rewritten when the choice changes, as `DECISIONS.md` is now; git
holds the history.

## The work

- [x] Each decision is its own file, `decisions/<slug>.md`, with an `area`
      field in frontmatter, the claim as its title, then the decision, why, and
      what it beat. The slug is the claim in a few words.
- [x] `DECISIONS.md` becomes an index written by a script, one line per
      decision grouped by area, as `pnpm run roadmap` writes the roadmap
      index. `check:docs` fails when it is stale. Existing links to
      `DECISIONS.md` keep resolving.
- [x] An entry is dropped when it restates the code or `ARCHITECTURE.md`, or
      when nobody would reach for what it rejected. Entries on one subject are
      merged.
- [x] A citation by quoted title becomes a path to the decision's file, so
      `check:docs` checks it. `roadmap/completed/` is history and keeps its
      citations.
- [x] `ARCHITECTURE.md` is bullets under its current headings: where code
      lives and what may import what. Reasons move to a decision or go.
- [x] `TERMINOLOGY.md` gives each term one or two lines.
- [x] `AGENTS.md` and the nested `AGENTS.md` files are cut to what an agent
      needs in every session. The root one loads into every session (5.1k
      tokens on 2026-10-13); detail only some tasks need moves to the skill or
      script header that covers that task.
- [x] The `docs` skill, the `code` skill, the agent briefs in `.claude/_agents/`
      and `AGENTS.md` describe the new layout.
