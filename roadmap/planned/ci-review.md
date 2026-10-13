---
milestone: later
---

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

## Prior art

Payload caches Playwright's browser by version (`.github/actions/setup-playwright`),
installs `chromium --no-shell`, and installs system dependencies only when a
test launch fails; it shards tests by database and shard. Strapi and TanStack
Router run `nx affected`, Astro uses Turbo's remote cache and a merge queue.
Every one splits build, lint and typecheck, tests and e2e into separate jobs,
and cancels superseded runs.

## Decided (2026-10-02)

- **The target is a verdict in under 3 minutes** for a push to main.
- **The Gate job splits into parallel jobs**: one test job per suite
  (schema-engine, core, admin, plugins), a static job (lint, typecheck,
  `check:unused`, `check:docs`, `check:exports`), and a build job (build,
  `check:node-imports`, both boot checks). The verdict waits on the slowest job,
  not the sum.
- **CI still runs only `verify.mjs`.** It gains `--only <group>`; each job runs
  one group, and a test checks the groups together equal the full mode, so the
  rule in `ci.yml`'s header holds. Rejected: CI calling package scripts
  directly, which is the drift that header rules out.
- **Node 22 is a matrix axis**, on the test jobs and the build job, replacing the
  Runtime job, which would otherwise become the slowest job.
- **Chromium is cached** with a copy of Payload's `setup-playwright` action, in
  every job that launches it.
- **Each job builds what it needs.** Rejected: one build job sharing `dist`,
  since its dependants would wait for it plus an artifact download, and minutes
  are free.
- **No affected-only runs, remote cache or merge queue.** They pay off at Astro's
  or Strapi's size, not at 6.5 minutes.
- **Local `verify` keeps the test suites sequential**, since parallel runs have
  been killed on low memory locally.

## The work

- [ ] **Does each check earn its time?** For each check in `verify` and each CI
      job, what defect it has caught (git history, CI failures), and whether
      another check would have caught it too. Propose cuts; don't make them.
- [ ] `verify.mjs --only <group>`, and the test that the groups cover the full
      mode.
- [ ] Split `ci.yml` into the jobs above, with the Node matrix.
- [ ] The Playwright cache action, used by the build and install jobs.
- [ ] Measure against the baseline above and the 3-minute target.
