---
milestone: 1.0
---

# Run only the checks a change affects

A full gate takes about 8 minutes locally: the test suites 4 to 5, lint about
1.5, `check:unused` about 1, the build and boot checks about 1.5. Every
change runs all of it, whatever it touched. `pnpm run land` refuses a branch
that does not contain the fetched `origin/main`, and the gate's stamp
(`verify-stamp.mjs`) is keyed on the whole tree, so a rebase over
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
  change. Mastra's [affected-tests.mjs](https://github.com/mastra-ai/mastra/blob/main/scripts/affected-tests.mjs) follows the import graph and
  runs everything when over half the tests are affected or the diff cannot
  be read. Astro's [turbo-run-affected.js](https://github.com/withastro/astro/blob/main/scripts/turbo-run-affected.js) selects changed packages
  without their dependents, so a core change skips the integrations' tests:
  the form to avoid.
- **Docs-only diffs take a cheap path** in 7 of 10 (Astro, Vitest, Payload,
  Mastra, Zed, Codex, workers-sdk).
- **A scoped check before merge and a full run on main after** is Codex's
  stated design; Zed and Astro also run unscoped on main.
- **Agents are told to run narrow checks**: Mastra ("Use the narrowest
  package build/test/lint/typecheck"), Ghostty, Astro, workers-sdk.

- **Turborepo is the common tool.** Of 26 TypeScript and JS repos checked
  on 2026-10-13 (the ten above plus TanStack, Hono, Drizzle, Strapi,
  Directus, Vite, Nuxt, SvelteKit, Better Auth, shadcn/ui, Next.js, React
  Router, Biome, oxc, Vue), 9 use Turborepo (Vercel AI SDK, Mastra, Astro,
  workers-sdk, Payload, Drizzle, Better Auth, shadcn/ui, Next.js), 3 use Nx
  (TanStack Router and Query, Strapi), 2 use Vite+ or its task runner (Hono,
  a single package, and oxc), 1 uses Bazel (Codex), and 11 use plain scripts
  or a native build tool. Each from the repo's root files. Vite+ reached 1.0
  on 2026-09-28 and its docs have no affected or changed-since mode. All
  three are MIT.

## The work

Turborepo runs every check, and its cache replaces the hand-written stamp.

- [x] **Each check is a Turborepo task with declared `inputs`.** The
      packages' `build`, `typecheck`, `lint`, `test:run` and `test:coverage`
      are package tasks with `dependsOn` where one reads another's output.
      The demo apps' boot checks and `typecheck` are package tasks too, on
      `^build`, so a new plugin reaches them through the app's dependencies.
      The rest (`check:docs`, `format:check`, `check:unused`,
      `check:exports`, `check:node-imports`, `check:hooks`, `check:scripts`)
      are root tasks (`//#<name>`). Root config the
      tasks read (the lockfile, `tsconfig*`, `eslint.config.js`, `scripts/`)
      is in `globalDependencies`, so changing it reruns everything. Markdown
      is outside every input but `check:docs` and `format:check`.
- [x] **`pnpm run verify` runs `turbo run … --affected` against
      `origin/main`.** A package change runs its dependents' tasks too,
      which Turborepo takes from the workspace graph. `verify.mjs` keeps the
      run lock, the lower priority and a log per task. `--all` drops
      `--affected` (`--full` already names a mode), and CI passes it, since
      on `main` the merge base is HEAD.
- [x] **The cache is shared and replaces the stamp.** `cacheDir` points at
      one directory outside the worktrees, so a new worktree reuses results
      `main` produced and a rebase over unrelated commits reruns nothing.
      `verify:status` and `land` read `turbo run … --affected --dry=json` and
      pass only when every task is a cache hit. The stamp script
      goes. CI keeps the cache between runs with `actions/cache`.
- [x] **`eslint-config-turbo` checks that a task declares the environment
      variables it reads**, so the cache key cannot miss one.
- [x] **`format:check` joins the gate.** Today the gate leaves it to the
      pre-commit hook, and the hook's Prettier glob skipped `.js` until
      2026-10-13, so `eslint.config.js` reached CI unformatted.
- [x] **`pnpm run land` no longer requires the branch to contain
      `origin/main`.** It merges when there is no conflict, writing the
      merged tree with `git merge-tree --write-tree` (today the merge commit
      takes HEAD's tree, which is only right when the branch contains main),
      and CI's full run on `main`, which it already waits for, is the check
      on the merge result. A setting turns the up-to-date rule and the
      unscoped local gate back on for after 1.0.
- [x] **`AGENTS.md` and `.claude/_agents/coder.md` give the narrow
      commands**: the touched package's test file, typecheck and lint while
      working, then the scoped gate before handing back.

## Testing

- A markdown-only change: `turbo run … --affected --dry=json` lists only
  `check:docs` and `format:check`.
- A schema-engine change lists the tasks of every package that depends on
  it; an admin change lists admin's and the plugins' but not core's; a
  lockfile change lists everything.
- A second `verify` on unchanged content is all cache hits, and so is one
  in a new worktree after `main` passed.
- `land`'s merge-tree step on a throwaway repository: a branch behind main
  with no conflict lands with main's newer commits kept; a conflict is
  refused.
