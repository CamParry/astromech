---
description: Plan and implement a new feature with the standard Astromech process (roadmap, branch/worktree, build, verify, docs)
argument-hint: <feature name or short description>
---

You are starting a new feature: **$ARGUMENTS**

Follow this process. Don't skip phases. Stop and ask before acting whenever a requirement is unclear — per CLAUDE.md, clarify before acting; for architecture decisions, talk it through first (no plans or option menus until the direction feels settled).

**Scale to the feature.** The phases below are the full process for a substantial feature. For a small, contained change, scale them down — skip the worktree (work directly on the feature branch), keep verification proportionate (still typecheck/lint/test, but a full browser-verify + `/review` + `/verify` pass may be overkill) — but never skip phase 5: roadmap, spec, and doc upkeep apply at every size. If you're unsure which mode fits, say which you're assuming and why.

## 1. Frame & plan

- **Roadmap check first.** Look in `roadmap/` (`planned/`, `in-progress/`, `completed/`, `backlog.md`). Is this already a feature file? If it's in `planned/`, you'll move it to `in-progress/` when work starts. If it's new, you'll create a kebab-case file. Status is encoded by directory — no status emoji in the H1.
- Understand scope. Read the relevant code and roadmap file. If the design isn't obvious, discuss it with me before writing a plan. For non-trivial designs, draft a working spec in `specs/` — but treat it as ephemeral scratch (deleted once shipped; never linked from durable docs).
- Mind vocabulary, structure, and best practices as you design: name things consistently with `TERMINOLOGY.md`, fit the layer model, and check how established CMSs handle the concern before inventing. For anything design-heavy, run `/plan` first and come back here to build.
- Decide the split: what you delegate to `coder` sub-agents (clear, self-contained slices — give them full plans with file paths and exact changes) vs. what you keep on the main thread (decisions, integration). Reserve the main thread for judgement; push implementation to agents.

## 2. Set up git

- **Commit or stash all in-progress changes in the main tree before any worktree work** — worktrees fork from the last commit and copying their output back silently overwrites uncommitted work.
- Create a feature branch (`feat/<kebab-name>`). Confirm with me before branching off `main` if unsure.
- If using a worktree: **don't trust `isolation: "worktree"`** — it forks from an unpredictable base here. Create it yourself from a verified base: `git worktree add -b <name> .claude/worktrees/<name> <verified-commit>`, confirm the base contains your latest commits, then run a non-isolated `coder` agent scoped to that absolute path.
- Move the roadmap file `planned/ → in-progress/` now that work has started.

## 3. Implement

- Delegate slices to `coder` sub-agents with complete plans (file paths, exact code, expected outcome) so they don't re-research.
- Code follows the `code`, `ui`, `api`, and `css` skills. Mind the known gotchas (reserved instance keys, content visibility shapes, globalThis singletons, locale display-vs-content, lazy seeding) — recall the relevant project memory before touching those areas.

## 4. Test & verify — all of these, not a subset

- `npm run typecheck` and `npm run lint` clean.
- Tests: use the `tester` agent (Vitest; real fixtures, never mock the DB). Add coverage for new logic and API/DB behaviour.
- `npm run build` (bump `NODE_OPTIONS` heap if the DTS worker OOMs).
- **The demo loads the library from `dist/`** — adapter/core changes need a rebuild + dev-server restart before they show up.
- Admin UI changes: browser-verify against the demo on **port 4323** (`admin@astromech.dev` / `password`). tsc + library build pass even with broken SPA side-effect imports — only the browser catches those. Discard test writes to `demo/database.db` afterward.
- Then run `/review` (standards + spec) and `/verify` (real-app behaviour) before considering it done.

## 5. Close out — keep roadmap, docs, and specs from drifting

This is part of the feature, not optional cleanup:

- **Roadmap:** tick `- [x]` sub-items; move the file to `completed/` if the feature is fully shipped, or leave in `in-progress/` with remaining boxes unchecked. Add `backlog.md` items for any follow-ups.
- **Specs:** delete the spec if the feature shipped, and de-link every reference to it (keep the prose, drop the link/citation). Stale specs breed drift.
- **Durable docs:** put lasting knowledge where it belongs — `src/types/`, `ARCHITECTURE.md`, `docs/`. Not in specs.
- **Reflect:** anything non-obvious worth a memory file or a skill update? A focus shift is the moment to capture lessons.
- Commit with conventional-commit messages (`feat:`/`fix:`/`refactor:`). **Confirm with me before committing or pushing to `main`.** Watch for sub-agents committing with `--no-verify` against instructions — check and fix.
