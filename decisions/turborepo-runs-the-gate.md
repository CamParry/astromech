---
area: toolchain
---

# Turborepo runs the gate

Each check is a Turborepo task with its `inputs`, run with `--affected` against `origin/main`. Its cache, shared by every worktree, replaces the gate's stamp.

**Why:** 9 of 26 TypeScript repos surveyed use it, among them Astro, workers-sdk, Payload, Drizzle and Better Auth. It hashes file contents, so a rebase over unrelated commits reruns nothing.

**Rejected:** a hand-written per-check stamp (about 300 lines doing what Turborepo does); Nx (heavier, with Cloud prompts; TanStack and Strapi use it); Vite+ (1.0 on 2026-09-28, with no affected mode in its docs).
