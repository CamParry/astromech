# 0046 — Worktrees live outside the checkout

**Date:** 2026-08-15
**Status:** accepted

Worktrees were created under `.claude/worktrees/<name>`, inside the main
checkout. `AGENTS.md` recorded the consequence as a limitation to work around:
"a worktree can't verify its own work", so flag the breakage and verify by
merging to main. They now live at `../Astromech-worktrees/<branch>`, and that
paragraph is deleted rather than reworded.

## Why the nested path broke verification

Node resolves a bare import by walking up parent directories looking for
`node_modules`. From `.claude/worktrees/x/` the walk reaches the repo root and
finds the main checkout's install, so the worktree needed no install of its
own. Both npm and pnpm link workspace packages by absolute path, so
`node_modules/astromech` pointed at the main checkout's `packages/astromech` —
the worktree got main's source and main's `dist` regardless of what its own
branch contained. A build passed, a test suite passed, and neither had run the
branch's code.

From a sibling path the same import fails with `MODULE_NOT_FOUND`. Verified by
creating a worktree at the new location and resolving `vitest` from it. The
fix is entirely about location; no package manager changes this, because the
parent-directory walk is Node's resolution algorithm rather than a packaging
behaviour.

## Why not keep it nested and work around it

The workaround was "verify by merging to main and testing there", which makes
main the only place work can be checked and serialises every parallel agent
behind it. Since the goal of a worktree here is several agents building at
once, a convention that cannot verify in place defeats its own purpose.

## Rejected alternatives

**Nested plus a private `node_modules` per worktree.** Node stops at the first
`node_modules` it finds walking up, so a real install inside the worktree does
shadow the parent. It works, and it is what the nested layout would need. It
was rejected because the failure mode when the install is missing or stale
stays silent — resolution falls through to the parent and succeeds with the
wrong code. The sibling path makes that same mistake loud, and a loud failure
beats a correct-but-fragile arrangement.

**A bare repository with worktrees as siblings under it.** The layout heavy
worktree users adopt. Rejected as more restructuring than the problem needs:
it moves the main checkout too, and the main checkout is fine where it is.

## What the move costs

A checkout carries only tracked files, so a fresh worktree needs `npm install`,
a copy of the gitignored `apps/demo/.env`, and its own `npm run build`.
`AGENTS.md` carries the list. `check:boot` already tolerates concurrency — it
builds a scratch database under `tmpdir` and takes a free port from the OS —
so the only collision left is `npm run dev`, which pins port 4323.

The `.gitignore` entry for `.claude/worktrees/` stays as a catch for anything
that still creates one there, notably the Agent tool's `isolation: worktree`,
which `AGENTS.md` already tells contributors not to use.
