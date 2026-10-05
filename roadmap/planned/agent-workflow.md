---
milestone: 1.0
---

# Agent workflow

Found on 2026-10-05 in a retrospective of eleven sessions (17 September to
5 October) and their 438 sub-agents. Each item recurred across sessions and
cost reruns, wasted tool calls or wrong answers. Counts come from the session
logs and were spot-checked. It follows
[the agent environment fixes](../in-progress/agent-environment.md), which
cover the gate's timeouts, environment, memory and reporting.

## Search and shell

- [ ] **An unquoted glob silently drops a search.** zsh aborts
      `grep -rn foo --include=*.ts` with `no matches found` before grep runs.
      About 570 calls failed this way, in every session, and most still
      exited 0 because the next command in the chain succeeded. Agents then
      reported "no other uses" from searches that never ran. Set
      `NO_NOMATCH` in the shell profile the Bash tool sources, and have the
      Bash hook refuse an unquoted `--include=*` with the reason.
- [ ] **macOS has no `timeout`.** 14 runs failed with
      `command not found: timeout`. Install `gtimeout` (coreutils) or say in
      `AGENTS.md` what to use instead.

## Gate output and reruns

- [ ] **A gate is rerun to read output that scrolled away.** 76 times a check
      ran again at once with a different `tail` or `grep` and no edit in
      between. `scripts/verify.mjs` writes each check's full output to a log
      file and prints its path beside `FAIL`. The `testing` skill says to
      search the log, not rerun.
- [ ] **The lead reruns a gate a sub-agent already ran.** The main thread ran
      `verify` again on 57 branches a sub-agent had verified, doubling the
      CPU cost. `verify` writes a stamp (HEAD, a hash of the uncommitted
      changes, the mode and the result) into the worktree's git directory, and
      the lead reruns only when the stamp does not match. Update the
      "Verify what comes back" bullet in `AGENTS.md` to match.

## Sub-agent briefs

- [ ] **A sub-agent cut off mid-task loses its work.** Six session-limit
      stops, one with about 70 uncommitted files, and research spawned twice.
      The implementer brief (`.claude/_agents/coder.md`) says to commit once
      at the end. Commit `wip(...)` on the worktree branch after each green
      step instead, and squash when the branch lands.
- [ ] **Shell reads make the Edit tool refuse.** About 190 "File has not been
      read yet" errors followed a `cat` or `sed` read, and agents ran
      `prettier --write` by hand 114 times though lint-staged formats on
      commit. The brief says: open a file with Read before Edit, and leave
      formatting to the hook. Consider a PostToolUse hook that runs prettier
      on the edited file, beside the stylelint one in `.claude/settings.json`.
- [ ] **Skills are read with `cat` instead of loading.** Sub-agents never
      invoked a skill. They read the `code` skill (20 KB) over 140 times and
      re-read `AGENTS.md`, which is already in their context: about a million
      tokens. `AGENTS.md` says the skills "load for the files they cover", but
      none sets `paths` in its frontmatter, which is what makes Claude Code
      load a skill for matching files. Add `paths` to `code`, `api` and
      `testing`, and tell agents in the brief that `AGENTS.md` is loaded. The
      stale skill list on that line is in
      [agent tooling and docs](../proposed/agent-tooling-and-docs.md).
- [ ] **Large outputs from `cat` loops.** 57 outputs went over the size
      limit, mostly `for f in …; do cat "$f"; done`, each followed by reads of
      the saved file. The brief says to read ranges with `grep -n` or
      `sed -n`.

## Research and review

- [ ] **Recommendations without prior art draw pushback.** The user asked
      "Does anyone else do this?" or the like seven times, and two
      recommendations were dropped. The prior-art step is in `/plan`, which
      free-form planning never loads. Add one line to "Workflow" in
      `AGENTS.md`: each recommendation names a CMS that does it, with a link,
      or says none was found, and each claim about platform behaviour says
      whether it came from docs or a test.
- [ ] **Prior-art source is fetched file by file.** One session made 947 web
      calls; Payload's source was fetched 205 times, Strapi's 129, Directus's 106. Keep shallow clones of the CMSs the repo compares against in one
      directory outside the repo, with a script that clones or updates them,
      and point `/plan` at it.
- [ ] **Tests that cannot fail are caught only at review.** In one session,
      five of ten reviews found one: an `it.fails` that passes on any error,
      an `@ts-expect-error` satisfied by the test's own annotation, property
      tests that restate the implementation. The `testing` skill asks the
      writer to break the code once and see each new test fail, and
      `pnpm run report:drift` flags an `it.fails` whose only assertion is a
      bare `toThrow()` or `rejects`.

## Landing

- [ ] **Landing on main stalls on approval.** The agent asked 22 times after
      the user had pre-approved, and once the auto mode classifier refused
      the push. Landing on main needs no approval in this repo (a memory note
      says so). Add an allow rule for the landing push to the project
      settings.
- [ ] **CI is watched with loops typed by hand.** About 25
      `sleep; gh run list; gh run watch` loops, two of which failed with a
      404 because the run did not exist yet. Landing ends by waiting for the
      run on the pushed commit and printing any failed job's log, in the
      worktree land step (a script or Worktrunk's merge hook).
- [ ] **A fresh worktree fails its first checks.** Seven agents hit a stale
      `dist`, six could not launch Chromium, four had no build. Worktree setup
      builds and installs Chromium (`playwright install chromium`).

## Once, but costly

- [ ] **Test temp directories filled the disk.** 35 GB of leaked temp
      directories left 157 MiB free. The leak is fixed; nothing would catch a
      new one. A global teardown that fails when a run leaves directories
      behind would.
- [ ] **`check:unused` prints a redundant-entry warning on every run**, for
      the `src/tables/index.ts!` entry in `knip.json`. Confirm and remove it.
- **Doc-wide rewrites while branches are open** made every open branch
  rebase. Land a rewrite of the root docs when no branch is open.
