# AGENTS.md

Astromech is a lightweight TypeScript CMS — a framework-agnostic core plus an Astro integration, built on TanStack Router and Hono. Read `ARCHITECTURE.md` before changing anything structural: it holds the layer model and the big-picture shape of each subsystem. When it disagrees with the code, the code wins — fix the file.

Nested `AGENTS.md` files cover `packages/astromech`, `packages/plugins`, `apps/demo` and `apps/docs`. The closest one to the file being edited wins.

## Where things live

`packages/*` is published to npm, `apps/*` is deployed and never published.

- **`packages/astromech`** — the published core. **`packages/schema-engine`**, **`packages/plugins/*`** (assistant, backups, forms, menus, redirects, seo) — the rest of the published surface.
- **`apps/demo`** — the app to run and browser-verify against, on Node. **`apps/demo-cloudflare`** — the same core on Workers, the smallest site that touches D1, R2, edge image transforms and Cron Triggers. **`apps/docs`** — user-facing guides.
- **`ARCHITECTURE.md`** — where code lives and what it may import. **`TERMINOLOGY.md`** — what a term means today. **`DECISIONS.md`** — why it beat the alternatives.
- **`roadmap/`** — one file per feature, status by directory (`planned/` → `in-progress/` → `completed/`).
- **`specs/`** — in-flight designs only. Delete a spec once its work ships; never link to one from durable docs or code.

## Commands and the gate

Before a change lands, all of these pass. The husky pre-commit hook runs lint-staged (eslint --fix + prettier) on touched files. **Never `--no-verify`.** If the hook fails, fix the cause.

| Command                          | Checks                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`             | `tsc` across every published package, then `astro sync && tsc --noEmit` in `apps/demo`, the only place the generated types are consumed as a site consumes them                                                               |
| `pnpm run test:run`              | vitest across `packages/schema-engine/tests/`, `packages/astromech/tests/` (mirrors `src/`) and `packages/plugins/assistant/tests/`. The assistant suite needs `build` first                                                  |
| `pnpm run build`                 | tsup. If the DTS worker runs out of memory, raise `NODE_OPTIONS=--max-old-space-size`                                                                                                                                         |
| `pnpm run lint`                  | eslint over `packages/schema-engine/src` and `packages/astromech/src` only. Plugin packages have no lint script, but the pre-commit hook lints their files anyway, so a plugin change can pass `lint` and then fail on commit |
| `pnpm run lint:css`              | stylelint over `packages/astromech/src/admin/styles/`                                                                                                                                                                         |
| `pnpm run format:check`          | prettier over the repo                                                                                                                                                                                                        |
| `pnpm run check:config`          | loads the demo config the way Astro does, catching a config-time import that reaches a domain service                                                                                                                         |
| `pnpm run check:node-imports`    | imports each plugin-facing subpath in plain Node from built `dist`. Runs after `build`                                                                                                                                        |
| `pnpm run check:exports`         | asserts `exports` and `publishConfig.exports` name the same subpaths and resolve into the same tree                                                                                                                           |
| `pnpm run check:docs`            | resolves every repo-relative link and backticked path in markdown. Skips `specs/` and `roadmap/planned/`                                                                                                                      |
| `pnpm run check:boot`            | builds `apps/demo`, boots the built server against a scratch database, and asserts `/` 200, `/cms` 200, `/cms/api/entries/post` 401 and one config evaluation                                                                 |
| `pnpm run check:boot:cloudflare` | builds `apps/demo-cloudflare` and serves it on workerd through wrangler's local emulation, asserting the same three routes plus a `scheduled()` tick. No Cloudflare account, no network                                       |

- **Neither boot check is in the pre-commit hook** (a full build is far too slow for one). They are the only way a defect in the serving process is visible. CI runs them; run `check:boot` by hand after anything that touches boot, the config path or the injected middleware, and `check:boot:cloudflare` after anything touching bindings, the environment or the Worker entry — it is the only check that runs the runtime outside Node.
- For refactors that move tables, `pnpm run db:generate` must also report "No schema changes".
- **pnpm is the package manager**, pinned by `packageManager` in the root `package.json`. `npm install` here builds a flat tree that hides undeclared dependencies, which is the failure mode pnpm exists to catch — so every package declares what it imports.
- **`pnpm-workspace.yaml` holds the workspace globs and the hoist list.** `publicHoistPattern` is not a convenience: the admin ships as source and the host app's Vite has to resolve its client dependencies from the app root, so that list must stay in step with `optimizeDeps.include` in `packages/astromech/src/integrations/astro/vite.ts`. A server dependency Vite cannot resolve gets inlined into the build instead of externalised, and anything loading a native binding by dynamic `require` breaks at request time when that happens.
- Other commands: `format`, `db:generate`, `db:init`.

## Documentation

Every document answers one question and has one home. A fact lives in exactly one file; everywhere else links to it. The `docs` skill has the full contract and loads when markdown is edited — these are the rules that decide where a paragraph goes:

- **`ARCHITECTURE.md` and `TERMINOLOGY.md` are a map of the present.** Present tense only. If a sentence needs "was", "used to", "no longer", "renamed from" or a date, it is history: delete it, or keep the reasoning in `DECISIONS.md` in the present tense.
- **`DECISIONS.md` holds the why** — one entry per live choice, what it beat, and nothing that the code already says. It is current state, edited when a choice is reversed; the history is `git log -p DECISIONS.md`.
- **`roadmap/` holds the work.** Status is the directory, never a field in the file.
- **`specs/` holds in-flight design**, deleted on ship. Nothing durable may link to a spec.
- **`apps/docs/` is user-facing**, and a page is a how-to, a reference, or an explanation — not two at once.
- **`pnpm run check:docs`** verifies every repo-relative link and backticked path in markdown resolves. It runs in the gate.

## Workflow

**Clarify → delegate → verify.**

- **Clarify before acting.** If a task is ambiguous, or the right approach depends on an unclear requirement, ask — don't assume and proceed.
- **Delegate coding implementation to sub-agents.** The main thread plans, decides, and reviews; the edits are written by a `coder` sub-agent. Make edits directly only for trivial one-liners, or when correcting a delegated agent.
- **Give the agent the whole plan** — file paths, exact code changes, expected outcomes — so it can execute without re-researching the codebase.
- **Verify what comes back.** Re-run the gate yourself; a sub-agent's report of a clean typecheck is not evidence, and one that contradicts a known test baseline is a red flag.
- **Don't commit while sub-agents are still writing in the same worktree.** The pre-commit hook stashes repo-wide and can clobber their in-flight edits.
- **Reflect on focus shifts.** When the focus of work changes significantly, pause: are there lessons that belong in a skill? Does a `roadmap/` file need to move between `planned/`, `in-progress/` and `completed/`, or a new one to be added?
- **No time estimates.**

## Branches and worktrees

**Implement on a branch, in a worktree.** Anything beyond a trivial edit gets its own branch checked out in its own worktree — never build a feature directly in the main checkout. Only `main` may be worked on in the main checkout.

Create the worktree by hand from a verified base, and run a non-isolated agent scoped to that path. The Agent tool's `isolation: worktree` forks from an unpredictable base and has landed work on the wrong one.

**Worktrees live outside the checkout**, at `../Astromech-worktrees/<branch>`. A worktree nested inside the repo inherits the main checkout's `node_modules` and `dist` through Node's parent-directory resolution, so its build passes with no deps installed and `apps/demo` serves main's code rather than the branch's. From a sibling path the same import fails with `MODULE_NOT_FOUND`, which is the point — the failure is loud instead of silent.

**A new worktree needs three things before it can verify itself**, because a checkout carries only tracked files:

- `pnpm install` — nothing resolves without it.
- **A copy of `apps/demo/.env`.** It is gitignored, so it does not travel, and without it the demo boot and the assistant fail in ways that don't name the cause.
- `pnpm run build` — its own `dist`, not main's.

`pnpm run check:boot` needs nothing further: it makes a scratch database under `tmpdir` and takes a free port from the OS, so worktrees can run it concurrently. Only `pnpm run dev` collides — `apps/demo/astro.config.mjs` pins port 4323, so pass `-- --port <n>` when a second worktree wants a dev server.

Nothing in this project is live yet — it's in active development. Optimise for a small, current, honest set of branches, not for isolating half-built work.

- **One branch per active workstream, and no more than two active at once.** Multi-workstream features (WS1, WS2, WS3…) get _one_ branch with a commit per workstream — never a branch per workstream. Stacked branch-per-workstream is what produced four labels pointing at the same three commits.
- **Land on main early.** Prefer merging partial work to main behind an unticked `roadmap/` checkbox over holding a long-lived feature branch. A branch more than ~10 commits behind main is a liability: the rebase cost grows faster than the isolation is worth, and nothing is deployed, so there's no release to protect.
- **Commit or stash the main working tree before launching work in a worktree.** Worktrees fork from the last commit — copying their output back will silently overwrite anything uncommitted.
- **A worktree's directory name must match its branch name.** A mismatch is how branches get lost and how the wrong one gets merged.
- **Remove a worktree as soon as its work is merged or parked.** Don't leave clean worktrees lying around.
- **Never leave uncommitted work in a worktree at the end of a session.** Commit it as `wip(scope): …` with a body saying what's unfinished and what it depends on, rather than leaving it loose.
- **Push every surviving branch to `origin` at the end of a session.** Local-only branches are unbacked-up work.
- **Delete a branch once its commits are contained elsewhere** — verify with `git merge-base --is-ancestor <branch> <keeper>` before deleting, never by eye.
- **Keep `roadmap/` status on `main`.** A roadmap file that only exists on a feature branch can't report that branch's status. If a branch is building something, its roadmap file belongs on main and moves between `planned/`, `in-progress/`, and `completed/` as the branch progresses.

## Naming

Astromech should read as if written by someone fluent in the existing web ecosystem — not as a private dialect a contributor has to be taught. **Use the established, commonly understood word wherever one exists.** Almost everything here has a well-worn name in the Astro / TanStack / Hono / Payload / Strapi / Drizzle world already; reach for that name before inventing one. If you can't recall the convention, look it up rather than picking whatever reads best in the moment.

Before adopting a term, check what it already means to a web developer:

- **Don't reuse a word that's taken in-domain.** "Bus" means _event bus_ (`emit`/`subscribe`); bare "context" means React context; "adapter", "middleware", "hook", "store", "provider", "signal", "engine", "pipeline", "kernel", "orchestrator", "gateway", "broker" and "manager" all carry specific expectations. Using one is fine when the thing genuinely **is** that thing and you can name the prior art in one sentence — "Laravel's `HttpKernel`, a request handler" is an answer; "it sounds core-ish" isn't. A colliding name costs the reader more than a plain one: they arrive with the wrong mental model and have to unlearn it.
- **Don't name a quality, a vibe, or an outcome.** "Ambient", "awareness", "insight", "smart", "unified", "holistic", "seamless", "intelligent" and "fabric" sound technical while carrying no information. These are the names most likely to get reached for when the thing isn't yet clearly understood — treat wanting one as a signal to go and understand the thing.
- **Don't coin unless nothing fits.** Every coinage is vocabulary every future reader must be taught. When one is genuinely unavoidable, it gets a `TERMINOLOGY.md` entry stating what it means and what it was chosen over.
- **Prefer boring and literal to clever.** A name that a stranger guesses correctly on first read has done its job.

The same thinking governs every identifier — functions, variables, files, types, config keys. The `code` skill has the conventions.

**It governs prose too**, not just things that get named: explanations, commit messages, review comments, docs. Use the word a working developer already recognises, or the one established in the specific niche being worked in. Reach for the plain word over a term of art from one methodology's dialect, and be especially wary of dialect that collides with a meaning the word already has here — say "experiment" or "throwaway test", not "spike", which in this domain reads as a jump in traffic or latency.

Where a name was contested, record the comparison rather than just the winner — `TERMINOLOGY.md` for what a term means today, `DECISIONS.md` for why it beat the alternatives, under "Reserved words" when the point is that the word is taken.

## Conventions

TypeScript, React, CSS and documentation rules live in the skills — `code`, `ui`, `api`, `css`, `docs` — which load automatically for the files they cover. Don't duplicate them here.
