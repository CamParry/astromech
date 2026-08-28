# Verification gate speed

The full gate takes 4 to 5 minutes run serially and has become a bottleneck.
This file holds the measurements and the mechanical work to make it fast. The
quality of what the gate checks is a separate problem with its own file:
[test-suite-trust](../planned/test-suite-trust.md).

## What is actually true today

Measured 2026-08-24 on a loaded machine (single runs, so indicative, not a
baseline): `build` 22s, `test:run` 68–90s, `typecheck` 54–90s, `lint` and
`format:check` ~22s each, the two boot checks 17s and 19s, everything else
1–12s. Serial total: 243–300s.

The cost is structural, not in any one check:

- **There is no orchestrator.** The gate is thirteen commands whose order lives
  only in `AGENTS.md` prose and `.github/workflows/ci.yml`, and the two have
  diverged: CI never runs `lint:css`, `check:config`, `check:node-imports`,
  `check:exports`, `check:docs` or `check:boot:cloudflare`, while it runs an
  `index:rebuild --check` job the documented gate never mentions. `AGENTS.md`
  says CI runs both boot checks; it runs one.
- **Core source goes through a compiler five times per run**: tsup, `tsc`, Vite
  inside each demo's `astro build`, and vitest's transform. The build phase is
  69% of `check:boot` and 79% of `check:boot:cloudflare`. Core's DTS pass alone
  is 11.5s, and only `typecheck` consumers need `.d.ts` at all.
- **Every typecheck was cold.** No `incremental`, no `tsBuildInfoFile` anywhere.
- **Test time is import cost, not assertions.** The core suite spends 369s of
  worker CPU importing modules against 117s running test bodies, because each
  of 222 files pays a cold import under vitest's default per-file-isolated
  forks pool. Three separate vitest invocations pay startup three times.
- **Three checks are redundant.** `check:config`'s failure mode is already
  forced by `astro sync` (in the demo typechecks) and both boot checks.
  `lint:css` is a strict subset of what the pre-commit hook runs. `format:check`
  survives only because the hook's globs miss `.mjs`, `.yml`, `.yaml` and
  `.jsonc`.
- **`check:boot` can pass against stale code.** It builds only `apps/demo`, not
  the packages, and most core subpaths resolve to `dist` even in-repo, so a
  core edit followed by `check:boot` alone verifies the previous build. CI is
  safe because it builds first; a local run is not.
- **Naive parallelisation is blocked by one shared file.**
  `routeTree.gen.ts` under `packages/astromech/src/admin/` is written by `tsr generate`
  (core's `pretypecheck`) and by the TanStack Router Vite plugin during each
  app build, so `typecheck` and the boot checks cannot overlap until the
  generator is serialised or the apps get their own output paths.

## The work

The target shape is three tiers with one build, encoded in a script that both a
developer and CI call, so the two descriptions cannot drift again.

- [x] Add a `verify` script encoding the tiers. `scripts/verify.mjs` runs
      stages in order and everything inside a stage at once: `pnpm run verify` is
      build, then the eight build-free checks together, then `typecheck`, then
      each boot check. `pnpm run verify:fast` is the packages' typechecks, their
      tests and lint, and came in at 55s on a loaded machine. Full run: 194s
      against 243-300s serial, with `check:boot` and `check:boot:cloudflare`
      making up 54s of the tail because they cannot yet overlap.
- [x] Widen the pre-commit tier: `check:exports` and `check:docs` now run in the
      hook (~0.5s each), and the lint-staged prettier glob covers `.mjs`, `.yml`,
      `.yaml` and `.jsonc`. Done with retiring `format:check` from the full run,
      below, since that is what the wider globs are for.
- [x] Point `ci.yml` at the tier scripts. Four jobs: `gate` runs `pnpm run verify`
      on the Active LTS, `runtime` runs `verify:runtime` on the floor version,
      `index` keeps the relationships-index parity check, `backstop` runs
      `format:check` and `lint:css` (the two verify leaves to the hook). CI and a
      developer now call the same script, so they cannot drift. This also closes
      [ci-runs-the-whole-gate](ci-runs-the-whole-gate.md): every
      documented check now runs in CI, including `check:boot:cloudflare`. The
      `AGENTS.md` gate table is corrected to match.
- [x] Enable `incremental` typechecking across the packages and demos. Each
      project writes its `tsBuildInfoFile` into its own `node_modules`, chosen over
      the default spot beside `outDir` because `tsup` cleans `dist/` and would wipe
      it every build.
      Cold 49s, warm 24s, and the warm run still catches a freshly introduced
      error. What is left is `astro sync` in the two demos and `tsr generate` in
      core's `pretypecheck`, both of which run unconditionally.
- [x] Split DTS out of `build`. `ASTROMECH_NO_DTS` gates `dts` in every package's
      tsup config, and a `build:js` script per package (aggregated by the root)
      sets it. `build:js` comes in around 8s against ~19s for the full build, so
      the boot checks, `check:node-imports`, the assistant suite and `verify:runtime`
      build the JS they run without paying for declarations they never read.
- [x] Revisit the pool settings. Core now runs on `pool: 'threads'` with
      `isolate: false`, taking its suite from 61s to 32s on a quiet machine and
      holding the same shape under load. The 39 files that mock a module, stub a
      global or write `globalThis.__astromech` opt back into isolation through a
      list a test keeps honest (`DECISIONS.md`).
      Merging the three configs into one workspace invocation was built and
      dropped: it matched three separate invocations to within a second and broke
      the one test that finds its wrangler config from the working directory.
      schema-engine and assistant are 1.5s and 0.8s, so their configs stand.
- [x] Make `check:boot` and `check:boot:cloudflare` runnable concurrently. A
      `routes:generate` stage now primes `routeTree.gen.ts` before both; the
      generator skips the write when the content is unchanged, so each app build
      reads it and neither writes. The pair drops from ~54s serial to ~27s, and
      the primed file's hash is unchanged across a concurrent run.
- [x] Fix the stale-`dist` hole in `check:boot` by failing loudly.
      `scripts/require-fresh-dist.mjs` runs first in both boot checks and throws
      when any package's `dist` is older than its `src` (excluding generated and
      test files). Chosen over building in the script, which would have the two
      concurrent boot checks race on the package `dist`.
- [x] Retire `check:config`, `lint:css` and `format:check` from the full run.
      The wider hook globs and CI's `backstop` job cover their residue.
      `check:config` stays a standalone probe for when the config path is edited.
- [x] Replace the manual `db:generate` instruction in `AGENTS.md` with a pointer
      to `packages/astromech/tests/db/drift.test.ts`, stating plainly that it
      covers `CORE_TABLES` only and says nothing about a plugin's own tables.
