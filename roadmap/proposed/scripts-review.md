---
milestone: 1.0
---

# Scripts review

`scripts/` holds about 6,800 lines in 22 files, plus four more under
`packages/astromech/scripts/`, each written its own way: 2 parse arguments
with `node:util` `parseArgs` and 9 read `process.argv` by hand; some share
`check-helpers.mjs` and some don't; one has tests (`run-lock.test.mjs`).

Waits for affected-checks, which moves the gate onto Turborepo and removes
the stamp, so the review sees what is left.

## Direction

Decided on 2026-10-13, and next in line after affected-checks:

- Every script that stays is TypeScript, run directly, with `tsx` or
  Node's own type stripping and no build step.
- Scripts follow one pattern.
- Each script has to justify itself: a standard tool, a package's own
  CLI, a Turborepo task, a test or CI config may be the better home, and
  some scripts may be overkill.
- The pass also looks for slow or wasteful runs.

## To decide

- Which scripts a standard tool replaces: Turborepo tasks for orchestration,
  a package's own CLI (for example `knip`, `publint`, `@arethetypeswrong/cli`)
  for a check, and which stay ours. Find what the projects in
  affected-checks' prior art keep in their `scripts/`.
- One shape for the scripts that stay: argument parsing, running a command,
  logging, exit codes and a header comment.
- Which scripts need `node:test` suites, beside the script, run by
  `check:scripts`.

## Known defects

- `land`'s CI watch crashes on a transient GitHub error: on 2026-10-13 a
  502 from `gh run watch` threw out of `watchCi` after the merge was pushed
  and cleaned up. It should retry, and say the merge is already on `main`.
- A task that reads a generated, gitignored file without `dependsOn` on its
  generator passes locally, where an earlier run left the file, and fails
  on CI's fresh checkout. On 2026-10-13 the plugins' typecheck read the
  admin's `routeTree.gen.ts` without `//#routes:generate`. Find the other
  generated files tasks read (`.astro/`, `dist`, `worker-configuration.d.ts`)
  and check each reader declares its generator.
- `check:boot:cloudflare` boots against the checkout's lasting
  `apps/demo-cloudflare/.wrangler/state`, so it can fail because of what
  earlier runs left there. On 2026-10-13 the main checkout's database
  predated `blocked_addresses`: the baseline migration was edited by hand,
  and an applied baseline never runs again. The sign-in 429 flake had the
  same cause. Each run could boot against a fresh `--persist-to` directory.
