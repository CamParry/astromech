---
milestone: 1.0
---

# Agent environment

Found on 2026-10-05 in a retrospective of the 2 to 5 October roadmap session,
which used 100 sub-agents across 12 worktrees. Each item cost that session
reruns, prompts or extra agents. Work lands on two branches: `gate-fixes`
(the checks) and `agent-tooling` (the hook, briefs and worktree scripts).

## Gate

- [ ] **Test timeouts trip under load.** The 5-second vitest limit failed four
      times (two admin tests, the GPS tests, then a scheduled CI run on main).
      Give the crafted-file GPS tests one shared timeout, and raise
      `testTimeout` where it only needs to catch a hang.
- [ ] **The checks need three environment fixes by hand.** A dummy
      `BETTER_AUTH_SECRET`, an unset `NODE_ENV` and a larger heap were pasted
      into every agent brief. The check scripts set them themselves.
- [ ] **One failing package hides the rest.** `test:run` chains packages with
      `&&`, so a coverage failure in core skips admin and the plugins. Run
      every package and report each.
- [ ] **Coverage thresholds fail only at the full gate.** `verify:fast` runs no
      coverage, so five branches passed it and then failed a threshold at the
      merge gate. Fast mode runs coverage for the packages a branch changes.
- [ ] **Two gates at once run out of memory.** A second `verify` waits for the
      first, across worktrees.

## Agent tooling

- [ ] **The git hook prompts for safe commands.** It asked 21 times in one
      session: false positives from words inside commit messages, and
      `branch -D` on merged branches. Parse each git call; allow destructive
      commands inside the sibling worktree directory and the deletion of a merged
      branch.
- [ ] **Process rules exist only as prose.** `pkill -f`, `killall` and
      `git stash` are refused by the hook, not by a line in each brief.
- [ ] **The implementer brief lives outside the repo.** `.claude/_agents/coder.md`
      holds the rules every implementation agent needs.
- [ ] **Worktree setup and landing are by hand.** Scripts create a ready
      worktree (install, `.env`, build, seeded database) and land a branch. The
      demo seed has a user without `publish` for browser checks.
- [ ] **Parsers of untrusted bytes get a time budget test up front.** The
      image metadata branch needed four review rounds, each finding a new slow
      crafted file. The `testing` skill says why.
