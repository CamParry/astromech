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

- `npm run build` in `apps/demo`, start `dist/server/entry.mjs` on a free port,
  and assert `/` and `/admin` return 200. A boot failure is a 500 on `/` and a
  404 on `/admin`, so both are worth asserting; the 404 is the misleading one.
- An authenticated `/api/*` read is the stronger assertion, and needs a seeded
  database and a sign-in. Decide whether that earns its cost or whether the two
  unauthenticated routes are enough.

## What to work out first

- **Where it runs.** The full sequence is slow enough that it does not belong in
  the pre-commit hook. A separate script the gate table names, or CI only.
- **What database it uses.** `apps/demo/database.db` is a working file, not a
  fixture. A check that writes to it is a check that changes a developer's data.
- **Whether `apps/demo` should get a typecheck at the same time.** It has none,
  and `roadmap/planned/demo-typecheck.md` has the 17 existing errors. The two are
  separate pieces of work but they land in the same place.
- **Whether the config-evaluation count is assertable.** A regression to
  double-boot is the specific thing that would undo the fix, and it is currently
  only visible by adding a `console.log` to the config by hand.
