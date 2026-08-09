# The Gate Runs a Build

Nothing in the gate builds the demo or starts a server. `npm run build` builds
the packages; `apps/demo` has no typecheck and no build step anywhere in CI.

That is how a deployed server that could not boot itself survived. Every gate
step passed on it. `astro dev` passed on it too, because there the config phase
and the SSR runtime share one process, so the empty registries were filled by
the build half of the same process. The defect was only visible by building
`apps/demo` and running `dist/server/entry.mjs` by hand, which
`roadmap/completed/runtime-boot-and-live-config.md` records.

The same is true of everything that fix was verified with: the 500-to-200, the
`{ custom: fn }` rule returning 422, the config-evaluation count. All measured
once, by hand, and nothing re-measures them.

## What a check would have to do

Building alone is not enough — the build always succeeded. The check has to
start the built server and make a request.

- [x] `npm run build` in `apps/demo`, start `dist/server/entry.mjs` on a free
      port, and assert `/` and `/admin` return 200. A boot failure is a 500 on
      `/` and a 404 on `/admin`, so both are worth asserting; the 404 is the
      misleading one. `/api/entries/post` is asserted at 401 as well, which
      separates "route mounted, caller rejected" from "runtime never booted".
- [x] An authenticated `/api/*` read is the stronger assertion, and needs a
      seeded database and a sign-in. **Declined** — the three unauthenticated
      statuses already separate every failure mode the boot defect produced, and
      a seed plus a sign-in is a large fixture for the margin.

## What to work out first

- [x] **Where it runs.** `scripts/check-boot.mjs`, wired as `npm run check:boot`,
      named in `ARCHITECTURE.md`'s gate table, with its own CI job. Not in the
      pre-commit hook — a full Astro build is far too slow for one.
- [x] **What database it uses.** A fresh one migrated into a temp directory,
      reached through `DATABASE_URL`, which `libsql()` already reads. Removed on
      every exit path. `apps/demo/database.db` is never opened.
- [x] **Whether `apps/demo` should get a typecheck at the same time.** It did —
      `roadmap/planned/demo-typecheck.md`, same branch, its own commit.
- [x] **Whether the config-evaluation count is assertable.** It is.
      `apps/demo/astromech.config.ts` logs one line per evaluation when
      `ASTROMECH_LOG_CONFIG_EVAL=1`, and the check counts them in the server's
      output. A counter on `globalThis` was rejected: nothing outside the
      process can read it without inventing a route to expose it.

## Verification

- [x] Run `npm run check:boot` for real on `main` and confirm it passes. It could
      not be run where it was written — a worktree cannot build `apps/demo` — so
      the first execution was on `main` after the merge. All four assertions
      pass, including the config-evaluation count.
