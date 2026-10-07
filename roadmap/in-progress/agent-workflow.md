---
milestone: 1.0
---

# Agent workflow

Found on 2026-10-05 in a retrospective of eleven sessions (17 September to
5 October) and their 438 sub-agents. Each item recurred across sessions and
cost reruns, wasted tool calls or wrong answers. Counts come from the session
logs and were spot-checked. It follows
[the agent environment fixes](../completed/agent-environment.md), which
cover the gate's timeouts, environment, memory and reporting.

## Search and shell

- [x] **An unquoted glob silently drops a search.** zsh aborts
      `grep -rn foo --include=*.ts` with `no matches found` before grep runs.
      About 570 calls failed this way, in every session, and most still
      exited 0 because the next command in the chain succeeded. Agents then
      reported "no other uses" from searches that never ran. `~/.zshenv`, the
      profile the Bash tool sources, sets `NO_NOMATCH` on this machine.
- [ ] **The Bash hook lets an unquoted glob through.** `NO_NOMATCH` is set on
      one machine only. Have the Bash hook refuse an unquoted `--include=*`
      with the reason.
- [x] **macOS has no `timeout`.** 14 runs failed with
      `command not found: timeout`. The implementer brief says what to use
      instead.

## Gate output and reruns

- [x] **A gate is rerun to read output that scrolled away.** 76 times a check
      ran again at once with a different `tail` or `grep` and no edit in
      between. `scripts/verify.mjs` writes each check's full output to a log
      file and prints its path beside `FAIL`. The `testing` skill says to
      search the log, not rerun.
- [x] **The lead reruns a gate a sub-agent already ran.** The main thread ran
      `verify` again on 57 branches a sub-agent had verified, doubling the
      CPU cost. `verify` writes a stamp (the git tree id of the working tree,
      HEAD, the mode and the result) into the worktree's git directory, and
      the lead reruns only when the stamp does not match. Update the
      "Verify what comes back" bullet in `AGENTS.md` to match.

## Sub-agent briefs

- [x] **A sub-agent cut off mid-task loses its work.** Six session-limit
      stops, one with about 70 uncommitted files, and research spawned twice.
      The implementer brief (`.claude/_agents/coder.md`) says to commit once
      at the end. Commit `wip(...)` on the worktree branch after each green
      step instead, and squash when the branch lands.
- [x] **Shell reads make the Edit tool refuse.** About 190 "File has not been
      read yet" errors followed a `cat` or `sed` read, and agents ran
      `prettier --write` by hand 114 times though lint-staged formats on
      commit. The brief says: open a file with Read before Edit, and leave
      formatting to the hook.
- [x] **Prettier runs only at commit.** A PostToolUse hook in
      `.claude/settings.json` runs prettier on each file Write or Edit
      changes, after stylelint for CSS (about 0.5 s an edit), so a reformat
      by the pre-commit hook no longer changes the content the gate's stamp
      records. A file changed through Bash is still formatted only at
      commit.
- [x] **Skills are read with `cat` instead of loading.** Sub-agents never
      invoked a skill. They read the `code` skill (20 KB) over 140 times and
      re-read `AGENTS.md`, which is already in their context: about a million
      tokens. `AGENTS.md` says the skills "load for the files they cover", but
      none sets `paths` in its frontmatter, which is what makes Claude Code
      load a skill for matching files. Add `paths` to `code`, `api` and
      `testing`, and tell agents in the brief that `AGENTS.md` is loaded. The
      stale skill list on that line is in
      [agent tooling and docs](../proposed/agent-tooling-and-docs.md).
- [x] **Large outputs from `cat` loops.** 57 outputs went over the size
      limit, mostly `for f in …; do cat "$f"; done`, each followed by reads of
      the saved file. The brief says to read ranges with `grep -n` or
      `sed -n`.

## Research and review

- [x] **Recommendations without prior art draw pushback.** The user asked
      "Does anyone else do this?" or the like seven times, and two
      recommendations were dropped. The prior-art step is in `/plan`, which
      free-form planning never loads. Add one line to "Workflow" in
      `AGENTS.md`: each recommendation names a CMS that does it, with a link,
      or says none was found, and each claim about platform behaviour says
      whether it came from docs or a test.
- [x] **Prior-art source is fetched file by file.** One session made 947 web
      calls; Payload's source was fetched 205 times, Strapi's 129, Directus's 106. Keep shallow clones of the CMSs the repo compares against in one
      directory outside the repo, with a script that clones or updates them,
      and point `/plan` at it.
- [x] **Tests that cannot fail are caught only at review.** In one session,
      five of ten reviews found one: an `it.fails` that passes on any error,
      an `@ts-expect-error` satisfied by the test's own annotation, property
      tests that restate the implementation. The `testing` skill asks the
      writer to break the code once and see each new test fail, and
      `pnpm run report:drift` flags an `it.fails` whose only assertion is a
      bare `toThrow()` or `rejects`.

## Landing

- [x] **Landing on main stalls on approval.** The agent asked 22 times after
      the user had pre-approved, and once the auto mode classifier refused
      the push. Landing on main needs no approval in this repo (a memory note
      says so). Add an allow rule for the landing push to the project
      settings.
- [x] **CI is watched with loops typed by hand.** About 25
      `sleep; gh run list; gh run watch` loops, two of which failed with a
      404 because the run did not exist yet. Landing ends by waiting for the
      run on the pushed commit and printing any failed job's log, in the
      worktree land step (a script or Worktrunk's merge hook).
- [x] **A fresh worktree fails its first checks.** Seven agents hit a stale
      `dist`, six could not launch Chromium, four had no build. Worktree setup
      builds and installs Chromium (`playwright install chromium`).

## Once, but costly

- [x] **Test temp directories filled the disk.** 35 GB of leaked temp
      directories left 157 MiB free. The leak is fixed; nothing would catch a
      new one. Core's and the plugins' runs point `os.tmpdir()` inside the
      run's directory, and the teardown fails the run when a test leaves
      anything there (`packages/astromech/tests/_support/run-temp-dir.ts`). It
      found one more leak, in the Astro integration tests.
- [x] **`check:unused` prints a redundant-entry warning on every run**, for
      the `src/tables/index.ts!` entry in `knip.json`. Confirmed and kept:
      the hint fires for the plugins that export `./tables`, but forms has no
      such export and `plugin:generate` loads its tables by path, which knip
      cannot see, so without the entry knip reports the file unused. The run
      prints 24 config hints in all, most "Refine entry pattern" from the
      shared `packages/plugins/*` block.
- **Doc-wide rewrites while branches are open** made every open branch
  rebase. Land a rewrite of the root docs when no branch is open.

## Gaps in the fixes

Found on 2026-10-06 by the review of the branch that shipped the hook, the
land script and the run lock. None has caused a failure yet; each is a gap in
a guard.

- [ ] **The Bash hook does not parse some shell syntax**: arrays
      (`a=(…)`), process substitution (`<(…)`), `case` and `[[ a < b ]]`.
      Find whether each makes the hook miss a command inside it or ask when
      it need not, and handle both.
- [ ] **The Bash hook lets `pnpm run land --no-gate-check` through.** The
      flag skips the check that the gate passed on the tree being landed, so
      an agent can land a tree no gate has seen. Refuse it with the reason.
- [x] **A boot check run on its own records no process groups.** The gate
      records each check's process group in the lock file
      (`recordProcessGroups` in `scripts/run-lock.mjs`), so a gate killed
      outright holds the lock until its checks end. `check:boot:cloudflare`
      run alone starts the build and wrangler in groups of their own and
      records neither, so if it is killed, wrangler keeps running and the
      next heavy run starts beside it. A run killed while taking over a stale
      lock also leaves an `astromech-run.lock.<pid>.stale` or `.tmp` file in
      the temp directory.
- [x] **`scripts/prior-art.mjs` hard-codes `Astromech-worktrees`.** The Bash
      hook works out `<checkout name>-worktrees`, so the two disagree for a
      checkout under another name.
