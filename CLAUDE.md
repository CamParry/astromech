# CLAUDE.md

Astromech is a lightweight TypeScript CMS. Built to work well across runtimes but designed for Astro + Cloudflare. Build on TanStack Router and Hono.

## Sub-agents

Use sub-agents wherever the task is clear enough to delegate. Always include a full implementation plan in the prompt — file paths, exact code changes, and expected outcomes — so the agent can execute without re-researching the codebase.

**Before launching a worktree agent:** ensure all in-progress changes in the main working tree are committed or stashed. Worktrees are forked from the last commit — copying their output back will silently overwrite any uncommitted work.

## Branches and worktrees

Nothing in this project is live yet — it's in active development. Optimise for a small, current, honest set of branches, not for isolating half-built work.

- **One branch per active workstream, and no more than two active at once.** Multi-workstream features (WS1, WS2, WS3…) get _one_ branch with a commit per workstream — never a branch per workstream. Stacked branch-per-workstream is what produced four labels pointing at the same three commits.
- **Land on main early.** Prefer merging partial work to main behind an unticked `roadmap/` checkbox over holding a long-lived feature branch. A branch more than ~10 commits behind main is a liability: the rebase cost grows faster than the isolation is worth, and nothing is deployed, so there's no release to protect.
- **A worktree's directory name must match its branch name.** A mismatch is how branches get lost and how the wrong one gets merged.
- **Remove a worktree as soon as its work is merged or parked.** Don't leave clean worktrees lying around.
- **Never leave uncommitted work in a worktree at the end of a session.** Commit it as `wip(scope): …` with a body saying what's unfinished and what it depends on, rather than leaving it loose.
- **Push every surviving branch to `origin` at the end of a session.** Local-only branches are unbacked-up work.
- **Delete a branch once its commits are contained elsewhere** — verify with `git merge-base --is-ancestor <branch> <keeper>` before deleting, never by eye.
- **Keep `roadmap/` status on `main`.** A roadmap file that only exists on a feature branch can't report that branch's status. If a branch is building something, its roadmap file belongs on main and moves between `planned/`, `in-progress/`, and `completed/` as the branch progresses.

## Workflow

- **Clarify before acting:** If a task is ambiguous or the right approach depends on an unclear requirement, ask first — don't assume and proceed.
- **Reflect on focus shifts:** When the focus of work changes significantly, pause to consider: are there lessons learned that belong in a skill? Anything worth saving to memory? Does the `roadmap/` directory need updating (a feature's status changed → move its file between `planned/`, `in-progress/`, `completed/`; or add a new feature file)?

## CSS Conventions

- All sizing values (widths, heights, padding, gap, margin, etc.) must be multiples of `0.25rem`. No arbitrary values like `2.2rem` or `7.1rem`.

## Communication

- Don't give time estimates for tasks
