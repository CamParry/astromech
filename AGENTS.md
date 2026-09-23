# AGENTS.md

Astromech is a lightweight TypeScript CMS: a framework-agnostic core plus an Astro integration. Read `ARCHITECTURE.md` before any structural change. When a doc disagrees with the code, the code wins: fix the doc.

Nested `AGENTS.md` files cover `packages/astromech`, `packages/admin`, `packages/plugins`, `apps/demo`, `apps/demo-cloudflare` and `apps/docs`. The closest one to the file being edited wins.

## Where things live

`packages/*` is published to npm; `apps/*` is never published. `apps/demo` is the app to run and browser-verify against. `ARCHITECTURE.md` ("Repository layout") lists every package.

- `ARCHITECTURE.md`: where code lives and what it may import. `TERMINOLOGY.md`: what a term means. `DECISIONS.md`: why a choice beat the alternatives.
- `roadmap/`: one file per feature, status by directory (`planned/`, `in-progress/`, `completed/`).
- `specs/`: in-flight designs, deleted once the work ships.

## Commands and the gate

Run `pnpm run verify:fast` while working (typecheck, tests, lint, `check:unused`; no build). Run `pnpm run verify` before a change lands. `pnpm run verify:runtime` is the version-sensitive subset CI runs on the floor Node version. **Never `--no-verify`**: if the pre-commit hook fails, fix the cause.

`verify` runs every check below except four: `format:check` and `lint:css` (the hook runs them), `check:config` (run it when you edit the config path) and `check:install` (needs the npm registry, so CI runs it separately).

| Command                          | Checks                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run typecheck`             | `tsc` over every package, then `astro sync && tsc --noEmit` in both demo apps                                                                          |
| `pnpm run test:run`              | vitest over every package, with per-directory coverage thresholds; the assistant suite needs `build` first                                             |
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
| `pnpm run report:drift`          | not a check: lists drift patterns and copies a branch adds; always exits 0                                                                             |

Each script's header has the detail.

- **Run the boot checks by hand.** Neither is in the pre-commit hook, and they are the only checks that see a defect in the serving process. Run `check:boot` after touching boot, the config path or the injected middleware, and `check:boot:cloudflare` after touching bindings, the environment or the Worker entry.
- **A core table change needs a migration.** `packages/astromech/tests/database/drift.test.ts` diffs `apps/demo/migrations/snapshot.json` against `CORE_TABLES`. When it fails, run `pnpm run db:generate` and commit the result. It does not cover plugin tables.
- **Use pnpm**, never `npm install`: a flat tree hides undeclared dependencies. Every package declares what it imports.
- Other commands: `format`, `db:generate`, `db:init`.

## Workflow

- **Clarify before acting.** If a task is ambiguous, or the approach depends on an unclear requirement, ask.
- **Delegate implementation to a sub-agent.** The main thread plans, decides and reviews. Edit directly only for a trivial one-liner or to correct a sub-agent.
- **Give the sub-agent the whole plan**: file paths, exact changes and expected outcomes, so it does not re-research the codebase.
- **Verify what comes back.** Re-run the gate yourself. A sub-agent's report of a clean run is not evidence.
- **Study a pattern before changing it.** Find where it already repeats. Change every copy, record the rest in a `roadmap/` file, or say why this one differs. A defect fix asks where else the same defect can occur.
- **Run `pnpm run report:drift` before a branch merges**, and give each item a decision in the merge summary: share it now, add it to a `roadmap/` file, or leave it with a reason.
- **Don't commit while sub-agents are writing in the same worktree.** The pre-commit hook stashes repo-wide and can clobber their edits.
- **When the focus of work shifts**, check whether a lesson belongs in a skill and whether a `roadmap/` file needs to move.
- **No time estimates.**

## Branches and worktrees

- **Anything beyond a trivial edit gets its own branch, in its own worktree.** Only `main` is worked on in the main checkout.
- **Create the worktree by hand from a verified base**, and run a non-isolated agent scoped to it. The Agent tool's `isolation: worktree` forks from an unpredictable base.
- **Worktrees live at `../Astromech-worktrees/<branch>`**, and the directory name matches the branch. A worktree nested inside the repo silently resolves main's `node_modules` and `dist`.
- **A new worktree needs `pnpm install`, a copy of the demo app's `.env` (gitignored) and `pnpm run build`** before it can verify itself. `check:boot` is safe to run in several worktrees at once; a second `pnpm run dev` needs `-- --port <n>`.
- **Commit or stash the main working tree before starting worktree work.** A worktree forks from the last commit, and copying its output back overwrites uncommitted changes.
- **At most two active branches.** A multi-workstream feature gets one branch with a commit per workstream.
- **Land on main early.** Nothing is deployed, so merge partial work behind an unticked `roadmap/` checkbox rather than keep a long-lived branch.
- **Keep `roadmap/` status on main.** A branch's roadmap file lives on main and moves directories as the branch progresses.
- **At the end of a session**, commit loose work as `wip(scope): …` with a body saying what is unfinished, push every surviving branch, and remove merged or parked worktrees.
- **Delete a branch only after `git merge-base --is-ancestor <branch> <keeper>` confirms** its commits are contained elsewhere.

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

Code, UI, API, CSS, docs and testing rules live in the skills under `.claude/skills/` (`code`, `ui`, `api`, `css`, `docs`, `testing`), which load for the files they cover. Don't repeat them here.
