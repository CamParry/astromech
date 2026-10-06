# AGENTS.md

Astromech is a lightweight TypeScript CMS: a framework-agnostic core plus an Astro integration. Read `ARCHITECTURE.md` before any structural change. When a doc disagrees with the code, the code wins: fix the doc.

Nested `AGENTS.md` files cover `packages/astromech`, `packages/admin`, `packages/plugins`, `apps/demo`, `apps/demo-cloudflare` and `apps/docs`. The closest one to the file being edited wins.

## Where things live

`packages/*` is published to npm; `apps/*` is never published. `apps/demo` is the app to run and browser-verify against. `ARCHITECTURE.md` ("Repository layout") lists every package.

- `ARCHITECTURE.md`: where code lives and what it may import. `TERMINOLOGY.md`: what a term means. `DECISIONS.md`: why a choice beat the alternatives.
- `roadmap/`: one file per feature, status by directory (`proposed/` needs planning, `planned/` is ready to build, then `in-progress/`, `completed/`) and a `milestone` field (`1.0` or `later`).
- `specs/`: in-flight designs, deleted once the work ships.

## Commands and the gate

While working, run the test file you touched (`pnpm -F <package> exec vitest run <path>`; the `testing` skill has the detail). Run `pnpm run verify:fast` before handing work back (typecheck, tests, lint, `check:unused`, `check:hooks`; no build, and coverage thresholds only for the packages the branch changes). Run `pnpm run verify` before a change lands. `pnpm run verify:runtime` is the version-sensitive subset CI runs on the floor Node version. Each check writes its whole output to a log, and a failing check's `FAIL` line names the file: search the log rather than rerun the check. A passing run writes a stamp that `pnpm run verify:status` compares with the worktree. **Never `--no-verify`**: if the pre-commit hook fails, fix the cause.

`verify` runs every check below except four: `format:check` and `lint:css` (the hook runs them), `check:config` (run it when you edit the config path) and `check:install` (needs the npm registry, so CI runs it separately).

| Command                          | Checks                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run typecheck`             | `tsc` over every package, then `astro sync && tsc --noEmit` in both demo apps                                                                          |
| `pnpm run test:run`              | vitest over every package, one at a time, with per-directory coverage thresholds; names every package that failed                                      |
| `pnpm run build`                 | tsup (out of memory: see `packages/astromech/AGENTS.md`)                                                                                               |
| `pnpm run lint`                  | eslint over packages and scripts, type-aware over package sources                                                                                      |
| `pnpm run lint:css`              | stylelint over the admin's styles                                                                                                                      |
| `pnpm run format:check`          | prettier over the repo                                                                                                                                 |
| `pnpm run check:config`          | loads both demo configs the way Astro does                                                                                                             |
| `pnpm run check:node-imports`    | imports core's plugin-facing subpaths and each plugin in plain Node; needs `build`                                                                     |
| `pnpm run check:exports`         | `exports` and `publishConfig.exports` agree                                                                                                            |
| `pnpm run check:docs`            | every repo-relative link and backticked path in markdown, `eslint.config.js` and doc comments resolves, and no source comment carries a history marker |
| `pnpm run check:unused`          | knip: unused files, exports and dependencies, and undeclared imports; then exports only tests use                                                      |
| `pnpm run check:boot`            | boots the built demo and drives the admin in chromium; needs `build`                                                                                   |
| `pnpm run check:boot:cloudflare` | serves `apps/demo-cloudflare` on workerd (see its `AGENTS.md`)                                                                                         |
| `pnpm run check:install`         | installs packed tarballs into a scratch site per `apps/docs/installation.md`, plus `@astromech/backups`                                                |
| `pnpm run check:hooks`           | the Claude Code Bash hook in `.claude/hooks/`, through its `node:test` suite                                                                           |
| `pnpm run report:drift`          | not a check: lists drift patterns, copies and test weakening a branch adds; always exits 0                                                             |
| `pnpm run land`                  | not a check: lands the current worktree's branch on main (see "Branches and worktrees")                                                                |

Each script's header has the detail.

- **Run the boot checks by hand.** Neither is in the pre-commit hook, and they are the only checks that see a defect in the serving process. Run `check:boot` after touching boot, the config path or the injected middleware, and `check:boot:cloudflare` after touching bindings, the environment or the Worker entry. Neither needs anything set in the shell: each uses a throwaway `BETTER_AUTH_SECRET` when none is set, and they and `verify` drop an inherited `NODE_ENV` (`scripts/check-helpers.mjs`).
- **Local runs leave the machine usable.** On macOS outside CI, the gate, the boot checks and the root `test:run`, `build`, `build:js`, `typecheck` and `lint` scripts run at utility QoS, vitest runs four workers, and the gate's typecheck and lint check two packages at once (`scripts/cpu-limits.mjs`). A direct `pnpm -F <package> exec vitest run` gets the four workers but not the lower priority. Set `ASTROMECH_FULL_SPEED=1` for the fastest run on an idle machine.
- **One heavy run at a time.** The gate, the boot checks and the root `build`, `build:js` and `test:run` scripts share a lock across every worktree and session (`scripts/run-lock.mjs`). One started while another holds it prints a `run-lock: waiting for …` line naming the holder and starts when that one ends. A direct `pnpm -F <package> exec vitest run`, `typecheck` and `lint` do not wait. When another run may hold the lock, start the gate, `test:run`, `build` or a boot check in the background: the wait can outlast a 2-minute tool timeout.
- **A core table change needs a migration.** `packages/astromech/tests/database/drift.test.ts` diffs `apps/demo/migrations/snapshot.json` against `CORE_TABLES`. When it fails, run `pnpm run db:generate` and commit the result. It does not cover plugin tables.
- **Use pnpm**, never `npm install`: a flat tree hides undeclared dependencies. Every package declares what it imports.
- Other commands: `format`, `db:generate`, `db:init`, `roadmap`.

## Workflow

- **Clarify before acting.** If a task is ambiguous, or the approach depends on an unclear requirement, ask.
- **Delegate implementation to a sub-agent.** The main thread plans, decides and reviews. Edit directly only for a trivial one-liner or to correct a sub-agent.
- **Give the sub-agent the whole plan**: file paths, exact changes and expected outcomes, so it does not re-research the codebase. Start the brief by pointing it to `.claude/_agents/coder.md`, the rules every implementation agent follows.
- **Verify what comes back.** Run `pnpm run verify:status --fast` in the worktree (`--full` for the full gate). It exits 0 only when that gate passed on the worktree's current content, committed since or not; otherwise re-run the gate yourself. A sub-agent's report of a clean run is not evidence. The stamp is, since the gate script writes it: it guards against a mistaken report, not a forged one, as an agent could write the file by hand.
- **Study a pattern before changing it.** Find where it already repeats. Change every copy, record the rest in a `roadmap/` file, or say why this one differs. A defect fix asks where else the same defect can occur.
- **Back each recommendation with prior art.** Name a CMS or framework that does it, with a link, or say none was found. Say whether each claim about platform behaviour comes from docs or from a test.
- **Run `pnpm run report:drift` before a branch merges**, and give each item a decision in the merge summary: share it now, add it to a `roadmap/` file, or leave it with a reason.
- **Don't commit while sub-agents are writing in the same worktree.** The pre-commit hook stashes repo-wide and can clobber their edits.
- **When the focus of work shifts**, check whether a lesson belongs in a skill and whether a `roadmap/` file needs to move.
- **No time estimates.**

## Branches and worktrees

- **Anything beyond a trivial edit gets its own branch, in its own worktree.** Only `main` is worked on in the main checkout.
- **Create a worktree with `git fetch -q origin && wt switch --create <branch> --base origin/main --no-cd --yes`** from the main checkout, then run a non-isolated agent scoped to it. The Agent tool's `isolation: worktree` forks from an unpredictable base. The pre-start steps in `.config/wt.toml` copy the `.env` files, install, build, seed the demo database and install Chromium, so run it in the background, one at a time, never beside a gate. If a step fails, fix the cause and rerun them with `wt -C <path> hook pre-start --yes`. `wt list` shows every worktree's state.
- **Worktrees live at `../Astromech-worktrees/<branch>`**, and the directory name matches the branch, so a branch name has no prefix or `/`. A worktree nested inside the repo silently resolves main's `node_modules` and `dist`. The path is in the Worktrunk user config, `~/.config/worktrunk/config.toml`: under `[projects."github.com/CamParry/astromech"]`, `worktree-path = "{{ repo_path }}/../{{ repo }}-worktrees/{{ branch | sanitize }}"` and `remove.delete-branch = false`.
- **`check:boot` is safe to run in several worktrees at once.** A second dev server needs `pnpm -F astromech-demo dev --port <n>` (with `-- --port`, pnpm passes a literal `--` and astro ignores the port); in a worktree, use the port `wt list` shows (`wt -C <path> step eval '{{ branch | hash_port }}'`). `astro dev` detaches: stop it by the PID it prints.
- **Commit the main working tree before starting worktree work.** A new worktree forks from `origin/main`, so a commit not yet pushed is missing from it, and copying its output back overwrites uncommitted changes.
- **At most two active branches.** A multi-workstream feature gets one branch with a commit per workstream.
- **Land on main early.** Nothing is deployed, so merge partial work behind an unticked `roadmap/` checkbox rather than keep a long-lived branch.
- **Keep `roadmap/` status on main.** A branch's roadmap file lives on main and moves directories as the branch progresses.
- **At the end of a session**, commit loose work as `wip(scope): …` with a body saying what is unfinished, push every surviving branch, and remove merged or parked worktrees.
- **Squash `wip` commits before landing** with `git reset --soft <base> && git commit -m '<message>'` inside the worktree, where `<base>` is the commit before the first `wip`: `rebase -i` needs a terminal and the Bash hook refuses `wt step squash`.
- **The lead lands with `pnpm run land`** from inside the worktree, once `pnpm run verify` has passed on its HEAD; a sub-agent never runs it. It refuses unless the gate's stamp records a full run on that content (`pnpm run verify:status --full`), then merges with `--no-ff` onto the fetched `origin/main`, pushes, removes the worktree and branch, fast-forwards the main checkout and waits for CI; `--message-file <path>` adds the merge body. Its header has the steps. Never `wt merge`: the Bash hook refuses it.
- **Remove an abandoned worktree with `wt remove <branch> --yes`.** It keeps the branch. Delete a branch only after `git merge-base --is-ancestor <branch> <keeper>` confirms its commits are contained elsewhere.

## Naming

Use the established word from the Astro, TanStack, Hono, Payload, Strapi and Drizzle world. If you can't recall the convention, look it up. A name a stranger guesses correctly on first read has done its job.

- **Don't reuse a word taken in-domain.** "Bus", bare "context", "adapter", "middleware", "hook", "store", "provider", "signal", "engine", "pipeline", "kernel", "orchestrator", "gateway", "broker" and "manager" carry specific meanings. Use one only when the thing is one and you can name the prior art in a sentence.
- **Don't name a quality or a vibe**: "ambient", "smart", "unified", "intelligent", "fabric". Wanting one is a sign the thing isn't understood yet.
- **Don't coin unless nothing fits.** A coinage gets a `TERMINOLOGY.md` entry saying what it means and what it was chosen over.
- **The same applies to identifiers and to prose**: comments, commit messages, reviews and docs. Prefer the plain word over one methodology's jargon.

Record a contested name's alternatives in `TERMINOLOGY.md` (what it means) or `DECISIONS.md` (why it won; "Reserved words" when the word is taken).

## Documentation

A fact lives in one file; everywhere else links to it. `ARCHITECTURE.md` and `TERMINOLOGY.md` describe the present, in the present tense. `DECISIONS.md` holds the why. Roadmap status is the directory. Nothing durable links to a spec. The `docs` skill has the full contract.

## Conventions

Code, API and testing rules live in the skills under `.claude/skills/` (`code`, `api`, `testing`). Each loads by itself when you work on a file matching the `paths` in its frontmatter. The `css`, `docs` and `ui` skills are parked under `.claude/_skills/`: read them as intent, not as rules. Don't repeat any of them here.
