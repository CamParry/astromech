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

## To decide

- Which scripts a standard tool replaces: Turborepo tasks for orchestration,
  a package's own CLI (for example `knip`, `publint`, `@arethetypeswrong/cli`)
  for a check, and which stay ours. Find what the projects in
  affected-checks' prior art keep in their `scripts/`.
- One shape for the scripts that stay: argument parsing, running a command,
  logging, exit codes and a header comment.
- Which scripts need `node:test` suites, beside the script, run by
  `check:scripts`.
