---
milestone: 1.0
---

# Run only the checks a change affects

A full gate takes about 8 minutes locally: the test suites 4 to 5, lint about
1.5, `check:unused` about 1, the build and boot checks about 1.5. Every
change runs all of it, whatever it touched. `pnpm run land` refuses a branch
that does not contain the fetched `origin/main`, and the stamp
(`scripts/verify-stamp.mjs`) is keyed on the whole tree, so a rebase over
commits that touched only roadmap markdown re-runs the whole gate. CI then
runs the full gate again on `main` after the merge.

On 2026-10-13 the schema-engine fix ran the full gate three times (once
needed, once after a docs-only rebase, once after a bad squash), and a
docs-only branch ran typecheck, every test suite, the build and both boot
checks. Until 1.0 this cost slows every change; once sites exist, changes
need the full gate again.

## Prior art

Researched on 2026-10-13 across ten projects. Repo claims come from their
source; merge rules come from each repo's public GitHub settings.

- **No project requires a branch to be up to date with main.** All nine with
  visible rules leave "require up to date" off. Codex tests GitHub's merge
  commit (`.github/workflows/README.md`); Zed uses a merge queue.
- **Results are cached by file contents.** workers-sdk's
  `.github/workflows/README.md`: a rebase does not force tests to run, since
  Turbo hashes file contents, not commits. Codex gets the same from Bazel.
- **Checks are picked from the diff, falling back to all.** Zed's
  `run_tests.yml` tests the changed crates and their reverse dependencies,
  and everything when the toolchain, `.cargo/`, `.github/` or `Cargo.lock`
  change. Mastra's `scripts/affected-tests.mjs` follows the import graph and
  runs everything when over half the tests are affected or the diff cannot
  be read. Astro's `scripts/turbo-run-affected.js` selects changed packages
  without their dependents, so a core change skips the integrations' tests:
  the form to avoid.
- **Docs-only diffs take a cheap path** in 7 of 10 (Astro, Vitest, Payload,
  Mastra, Zed, Codex, workers-sdk).
- **A scoped check before merge and a full run on main after** is Codex's
  stated design; Zed and Astro also run unscoped on main.
- **Agents are told to run narrow checks**: Mastra ("Use the narrowest
  package build/test/lint/typecheck"), Ghostty, Astro, workers-sdk.

## The work

- [ ] **The stamp records each check by the files it reads.** A check
      declares its inputs (a package's sources and tests, the root config,
      the lockfile), and the stamp records a content hash per check. A check
      whose inputs are unchanged since its last pass is reused, so a rebase
      over unrelated commits re-runs nothing.
- [ ] **The gate picks checks from the diff since the merge base.**
    - A markdown-only diff runs `check:docs` and `format:check`.
    - A package change runs that package's tests and the tests of every
      package that depends on it, from the workspace's `package.json`
      dependencies.
    - The boot checks run when the diff reaches boot, the config path, the
      injected middleware or the Worker entry, or a package they build.
    - Typecheck, lint and `format:check` stay repo-wide.
    - It falls back to the full gate when the diff touches the root
      `package.json`, `pnpm-lock.yaml`, `tsconfig*`, `eslint.config.js`,
      `scripts/`, `.github/` or a vitest config, or when the diff cannot be
      computed.
    - It prints which checks it chose and why, and `--full` still runs
      everything.
- [ ] **`format:check` joins the gate.** Today the gate leaves it to the
      pre-commit hook, and the hook's Prettier glob skipped `.js` until
      2026-10-13, so `eslint.config.js` reached CI unformatted.
- [ ] **`pnpm run land` takes the scoped gate's stamp and no longer requires
      the branch to contain `origin/main`.** It merges when there is no
      conflict, and CI's full run on `main`, which it already waits for, is
      the check on the merge result. A setting turns the full local gate and
      the up-to-date rule back on for after 1.0.
- [ ] **`AGENTS.md` and `.claude/_agents/coder.md` give the narrow
      commands**: the touched package's test file, typecheck and lint while
      working, then the scoped gate before handing back.

## Testing

`node:test` suites beside the scripts, run by `check:scripts`: the selection
for a markdown-only diff, a schema-engine change (schema-engine and core), an
admin change (admin and the plugins), and a lockfile change (everything); a
stamp reused across a rebase that touches none of a check's inputs, and not
reused when one input changes.
