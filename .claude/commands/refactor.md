---
description: Restructure existing code without changing behaviour — terminology, structure, and best practices, with a safety net and the standard build/verify/docs flow
argument-hint: <what to refactor / the smell or goal>
---

You are refactoring: **$ARGUMENTS**

A refactor improves the **structure** of existing code without changing its **behaviour**. If behaviour needs to change, that's a `/feature` — say so and stop. Don't skip phases; scale them to the size of the change (a small rename needs no worktree; never skip phase 5).

Per `AGENTS.md`, clarify before acting; for structural decisions, discuss the direction first rather than assuming.

## 1. Frame the refactor

- Name the smell and the target shape. What's wrong with the current structure, and what does "better" look like? Read the code, `ARCHITECTURE.md`, `TERMINOLOGY.md`, and recall relevant project memory.
- Scope it. Refactors sprawl — draw a clear boundary and resist unrequested improvements outside it.

## 2. Terminology, structure & best practices — the heart of this

- **Vocabulary:** are things named precisely and consistently? Align names with `TERMINOLOGY.md`; rename to kill ambiguity/overloading; note any term that should be added or revised there. (The `ubiquitous-language` skill can help.)
- **Structure:** deepen shallow modules, simplify interfaces, remove needless indirection, and respect the one-way layer model — dependencies flow one way through the stack. (The `improve-codebase-architecture` skill is built for finding these.)
- **Prior art & best practices:** check how established TypeScript projects and CMSs (Payload, Strapi, Sanity, AdonisJS, etc.) structure the same concern; borrow what fits Astromech's lightweight, type-first, edge context. Apply the `code` skill's rules.

## 3. Safety net first

- A refactor is only safe with a behaviour check. Ensure tests cover the code you're about to move **before** you move it; if coverage is thin, add characterization tests first, following the `testing` skill.
- Capture the current behaviour (test output, or a browser-verify baseline for admin UI) so you can prove it's unchanged afterward.

## 4. Set up git

- **Commit all in-progress changes in the main tree first.** A new worktree forks from `origin/main`, so an unpushed commit is missing from it, and copying its output back silently overwrites uncommitted work.
- Create the branch and its worktree with `git fetch -q origin && wt switch --create <kebab-name> --base origin/main --no-cd --yes`, in the background (`AGENTS.md`, "Branches and worktrees"). The branch has no prefix, because the worktree's directory name must match it. **Don't use `isolation: "worktree"`** (forks from an unpredictable base here): run a non-isolated agent scoped to the worktree's absolute path, briefed from `.claude/_agents/coder.md`.

## 5. Execute in small, reversible steps

- Delegate self-contained slices to sub-agents briefed from `.claude/_agents/coder.md`, with full plans. Keep each step behaviour-preserving and independently green — don't pile structural changes into one untestable jump.

## 6. Verify — prove behaviour is unchanged

- `pnpm run typecheck` and `pnpm run lint` clean; the test suite green (same results as the phase-3 baseline).
- `pnpm run build` (bump `NODE_OPTIONS` heap if the DTS worker OOMs). The demo loads the library from `dist/` — rebuild + restart the dev server before checking.
- Admin UI: browser-verify against the demo on **port 4323** (`admin@astromech.dev` / `password`); broken SPA side-effect imports pass tsc + build and only show up in the browser. Discard test writes to the demo database.
- Run `/review` and `/verify`. The bar for a refactor is: same behaviour, better structure.

## 7. Close out — keep docs and terminology current

- **Terminology:** update `TERMINOLOGY.md` for any term you renamed, added, or clarified.
- **Architecture/docs:** update `ARCHITECTURE.md` if the structure or layer boundaries shifted; refresh the docs and type definitions as needed.
- **Roadmap:** update or tick the relevant `roadmap/` file; add `backlog.md` follow-ups.
- **Reflect:** capture any non-obvious lesson as a memory file or skill update.
- Commit with conventional-commit messages (`refactor:`). Landing on `main` needs no approval in this repo: the lead lands the branch with `pnpm run land` from its worktree, after squashing any `wip` commits (`AGENTS.md`, "Branches and worktrees"). Sub-agents never land. Check that sub-agents didn't commit with `--no-verify`.
