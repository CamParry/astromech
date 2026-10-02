# CI review

Review how CI runs the checks: whether it can give a verdict sooner, whether
each script earns its time, and how comparable projects run theirs. Earlier
work set up the current shape: [ci-runs-the-whole-gate](../completed/ci-runs-the-whole-gate.md)
and [verification-gate-speed](../completed/verification-gate-speed.md).

The repo is public, so Actions minutes are free; what matters is how long a
push waits for a verdict. A push takes about 6.5 minutes, set by the Gate job.

## Baseline (run 37026298014, 2026-10-02)

`verify` in the Gate job took 5m20s. Per check, on CI and locally:

| Check                   | CI   | Local |
| ----------------------- | ---- | ----- |
| `test:run`              | 184s | 80s   |
| `typecheck`             | 70s  | 50s   |
| `lint`                  | 55s  | 45s   |
| `build`                 | 41s  | 25s   |
| `check:unused`          | 33s  | 25s   |
| `check:boot`            | 24s  | 17s   |
| `check:boot:cloudflare` | 18s  | 11s   |

Each job also spends about 14s on `pnpm install` and 25 to 30s downloading
Chromium. Seven of the last 30 runs on main were cancelled by a newer push,
which is expected with several sessions pushing.

## Questions

- [ ] **The test suites run one after another.** The root `test:run` is an
      `&&` chain (schema-engine, core, admin, plugins). Measure running them in
      parallel on the 4-vCPU runner, or as separate jobs, against the memory
      limits that have killed parallel runs locally.
- [ ] **`typecheck` has a stage of its own** because it and the app builds both
      write `routeTree.gen.ts`. `verify` already runs `routes:generate` first to
      settle the same race for the boot checks; check whether that lets
      `typecheck` overlap the tests.
- [ ] **Cache the Chromium download** across the four jobs that fetch it, and
      check whether the two install guide jobs can share one build.
- [ ] **Does each script earn its time?** For each check in `verify` and each
      CI job, what defect has it caught (from git history and CI failures), and
      would another check have caught it too.
- [ ] **How do comparable projects run CI?** Look at Astro, Payload, Strapi,
      TanStack Router and Drizzle: job split, test sharding, caching (Turborepo
      or Nx remote cache, `actions/cache`), affected-only runs on pull requests,
      merge queues, and what runs on every push versus nightly.
- [ ] Decide what to change, and move this file to `planned/` with the work
      items.
