# AGENTS.md

Astromech is a lightweight TypeScript CMS: a framework-agnostic core plus an Astro integration. Read `ARCHITECTURE.md` before any structural change. When a doc disagrees with the code, the code wins: fix the doc. The nested `AGENTS.md` closest to the file being edited adds to this one.

## Where things live

- `packages/*` is published to npm; `apps/*` never is. `apps/demo` is the app to run and browser-verify against. `scripts/` is the repository's own tooling, a private workspace package of TypeScript run by plain `node`; test a file there with `node --test "scripts/lib/<file>.test.ts"`.
- `ARCHITECTURE.md`: where code lives and what it may import. `TERMINOLOGY.md`: what a term means.
- `decisions/`: one file per choice and what it beat. Read the `DECISIONS.md` index, open only the decision you need, and cite it by its file path.
- `roadmap/`: one file per feature. Status is the directory (`proposed/`, `planned/`, `in-progress/`, `completed/`).
- `specs/`: in-flight designs, deleted once the work ships.

## Commands and the gate

- While working, run the narrow thing: the test file you touched (`pnpm -F <package> exec vitest run <path>`), or one package's task (`pnpm exec turbo run <task> --filter <package>`).
- **The gate (`pnpm run verify`) runs through Turborepo**: only the tasks a change affects since `origin/main`, reusing cached passes. `--all` checks everything. Run it once before handing work back or landing, after the last change. Don't rerun it to confirm a pass: `verify:status` reads the cache. A failing check's `FAIL` line names its log: search the log rather than rerun the check.
- **Never `--no-verify`.** If the pre-commit hook fails, fix the cause.
- **Run the boot checks by hand**, since no hook does: `check:boot` after touching boot, the config path or the injected middleware, and `check:boot:cloudflare` after touching bindings, the environment or the Worker entry. Run `check:config` after editing the config path.
- **One heavy run at a time.** The gate, the boot checks and the root `build`, `build:js` and `test:run` share a lock across worktrees and sessions (`scripts/lib/run-lock.ts`). When another run may hold it, start yours in the background: the wait can outlast a 2-minute tool timeout.
- **A core table change needs a migration.** When `packages/astromech/tests/database/drift.test.ts` fails, run `pnpm run db:generate` and commit the result. It does not cover plugin tables.
- **Use pnpm**, never `npm install`: a flat tree hides undeclared dependencies.
- Each script's header has the detail. `verify` skips `check:install` (CI runs it) and `check:deployed:cloudflare` (`apps/demo-cloudflare/AGENTS.md`).

## Workflow

- **Clarify before acting**: ask when a task, or a requirement the approach depends on, is unclear.
- **Delegate implementation to a sub-agent**; edit directly only for a trivial one-liner or to correct one. Give it the whole plan (file paths, exact changes, expected outcomes), starting from `.claude/_agents/coder.md`.
- **Verify what comes back** with `pnpm run verify:status --full` in the worktree, and run the gate yourself if it fails. A sub-agent's report of a clean run is not evidence; the cache is.
- **Study a pattern before changing it.** Change every copy, record the rest in a `roadmap/` file, or say why this one differs. A defect fix asks where else the same defect can occur.
- **Back each recommendation with prior art**: a linked CMS or framework that does it, or "none found". Say whether each claim about platform behaviour comes from docs or a test.
- **Run `pnpm run report:drift` before a branch merges**, and give each item a decision in the merge summary: share it now, add it to a `roadmap/` file, or leave it with a reason.
- **Don't commit while sub-agents are writing in the same worktree**: the pre-commit hook stashes repo-wide.
- **When the focus of work shifts**, check whether a lesson belongs in a skill and whether a `roadmap/` file needs to move.
- **No time estimates.**

## Branches and worktrees

- **Anything beyond a trivial edit gets its own branch, in its own worktree** at `../Astromech-worktrees/<branch>` (`worktree-path` in `~/.config/worktrunk/config.toml`), so a branch name has no prefix or `/`. Only `main` is worked on in the main checkout.
- **Create a worktree with `git fetch -q origin && wt switch --create <branch> --base origin/main --no-cd --yes`** from the main checkout, in the background, one at a time and never beside a gate. Then run a non-isolated agent scoped to it: `isolation: worktree` forks from an unpredictable base.
- **Commit the main working tree before starting worktree work**: a new worktree forks from `origin/main`.
- **At most two active branches.** A multi-workstream feature gets one branch with a commit per workstream.
- **Land on main early**, with partial work behind an unticked `roadmap/` checkbox, rather than keep a long-lived branch. A branch's roadmap file, and so its status, stays on main.
- **At the end of a session**, commit loose work as `wip(scope): …` with a body saying what is unfinished, push every surviving branch, and remove merged or parked worktrees.
- **Squash `wip` commits before landing** with `git reset --soft "$(git merge-base HEAD origin/main)" && git commit -m '<message>'` inside the worktree, then check `git show --stat HEAD` lists only the branch's files: a reset onto a newer `origin/main` folds the reversal of main's later commits into yours (`rebase -i` needs a terminal; the Bash hook refuses `wt step squash`).
- **The lead lands with `pnpm run land`** from inside the worktree, once `pnpm run verify` has passed on its HEAD; a sub-agent never runs it. The branch needs no rebase onto main: `land` merges it, and refuses a conflict. Its header has the steps. Never `wt merge`.
- **Remove an abandoned worktree with `wt remove <branch> --yes`**, which keeps the branch. Delete a branch only after `git merge-base --is-ancestor <branch> <keeper>` confirms another branch contains it.

## Naming

Use the established word from the Astro, TanStack, Hono, Payload, Strapi and Drizzle world. The same applies to prose: comments, commit messages, reviews and docs are plain English, with no em dashes.

- **Don't reuse a word taken in-domain.** "Bus", bare "context", "adapter", "middleware", "hook", "store", "provider", "signal", "engine", "pipeline", "kernel", "orchestrator", "gateway", "broker" and "manager" are taken. Use one only when the thing is one and you can name the prior art in a sentence.
- **Don't name a quality or a vibe**: "ambient", "smart", "unified", "intelligent", "fabric".
- **Don't coin unless nothing fits.** A coinage gets a `TERMINOLOGY.md` entry saying what it means.
- **Record what a contested name beat** in [`decisions/reserved-words.md`](decisions/reserved-words.md) when the word is reserved for one thing, or in a decision of its own.

## Documentation

A fact lives in one file; everywhere else links to it. Nothing durable links to a spec. The `docs` skill has the full contract.

The `css`, `docs` and `ui` skills under `.claude/_skills/` are parked: read them as intent, not as rules.
