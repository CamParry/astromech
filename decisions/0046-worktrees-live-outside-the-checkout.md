# 0046 — Worktrees live outside the checkout

**Date:** 2026-08-15
**Status:** accepted

Worktrees move from `.claude/worktrees/<name>` to `../Astromech-worktrees/<branch>`, because Node's parent-directory resolution let a nested worktree silently use the main checkout's `node_modules` and `dist`, so builds and tests never ran the branch's code. Rejected nesting with a private per-worktree `node_modules` (fails silently when stale) and a bare-repo sibling layout.
