---
milestone: 1.0
---

# Scripts review

`scripts/` held about 6,800 lines in 22 files, plus four under
`packages/astromech/scripts/`, each written its own way: 2 parsed arguments
with `node:util` `parseArgs` and 9 read `process.argv` by hand; some shared
`check-helpers.mjs` and some didn't; one had tests.

## Decided (2026-10-13)

- **Scripts are TypeScript run by plain `node`** (type stripping, on without
  a flag from Node 22.18, from Node's docs). Measured startup: 41 ms for a
  trivial `.ts` script against 120 ms under `tsx`. `tsx` stays only for the
  commands that import package source through `tsconfig` paths
  (`check:config`, `db:generate`, `db:init`, `db:seed:demo`). `engines` goes
  to `>=22.18.0`.
- **`scripts/` is a private workspace package** with its own
  `devDependencies`, `tsconfig.json` and `lint`, `typecheck` and `test`
  tasks, as Astro's `astro-scripts`, Sanity and workers-sdk do. Rejected: a
  flat folder with a root `tsconfig` (TanStack, Hono).
- **One pattern**, after Astro and TanStack Router: `scripts/<entry>.ts`,
  shared code in a `lib` folder, `<name>.test.ts` beside each file run by
  `node --test`; arguments through `parseArgs` with `strict: true` (Astro,
  TanStack, Sanity and workers-sdk; none uses `cac` or `commander`);
  subprocesses through one `lib/run.ts` over `node:child_process` (9 of 10
  projects; Drizzle uses `zx`); `> step`, `ok` and `FAIL` lines; exit 0
  pass, 1 fail, 2 usage, set through `process.exitCode`.
- **publint joins `check:install`** now; `@arethetypeswrong/cli` waits for the
  pre-launch audit.
- **`packages/astromech/scripts/seed.ts` and `db:seed` go**: `db:seed:demo`
  is the seed CI and new worktrees use.

## The work

- [ ] The `scripts` package: `package.json`, `tsconfig.json` (Node's
      recommended type-stripping block: `erasableSyntaxOnly`,
      `verbatimModuleSyntax`, `allowImportingTsExtensions`, `noEmit`),
      `lib/run.ts`, and its tasks in Turborepo. Each root task lists the
      scripts it reads in `inputs`, so `scripts/**` and `.github/**` leave
      `globalDependencies`.
- [ ] Every kept script converted to the pattern: the gate family
      (`verify`, `gate`, `land`, `merged-tree`, `run-lock`, `process-group`,
      `check-helpers`, `cpu-limits`), then the checks (`check-boot`,
      `check-boot-cloudflare`, `admin-browser-check`, `check-install`,
      `check-deployed-cloudflare`, `check-docs-links`), then the rest
      (`report-drift`, `prior-art`), and the Bash guard hook, whose tests
      call its decision function in process instead of spawning it.
- [ ] Merged: `roadmap-index` and `decisions-index` into one `docs-index`;
      `verify-status` into `verify --status`; `run-at-lower-priority` into
      one wrapper that runs root `build`, `typecheck`, `lint` and `test:run`
      through Turborepo and its cache.
- [ ] Moved: core's `check-exports-parity` and `check-node-imports` into
      `scripts/`; the second runs its imports in parallel.
- [ ] Replaced or deleted: `workspace-packages` reads `pnpm ls -r --json`;
      `test-mutation.mjs` becomes a `stryker run` script; `cpu-limits.d.mts`,
      `seed.ts` and the `package.json` entries nothing calls go;
      `require-fresh-dist` goes once `check-install` runs as a Turborepo task
      after the builds.
- [ ] The pre-commit hook calls `pnpm exec` instead of `npx`, runs its checks
      with `node` directly, and writes the indexes when `roadmap/**` or
      `decisions/**` changes.
- [ ] The known defects below.

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
  `.wrangler/state` in the app, so it can fail because of what
  earlier runs left there. On 2026-10-13 the main checkout's database
  predated `blocked_addresses`: the baseline migration was edited by hand,
  and an applied baseline never runs again. The sign-in 429 flake had the
  same cause. Each run could boot against a fresh `--persist-to` directory.
