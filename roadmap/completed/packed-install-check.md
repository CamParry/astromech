# Packed install check

Every check in the gate runs against the workspace: the demo apps link the
packages, so Vite never pre-bundles them, and `apps/demo`'s old baseline
migration carries tables a new site's `db:generate` does not create. On
2026-09-15 a scratch site installed from `pnpm pack` tarballs found two
defects that passed the whole gate: the auth tables missing from `CORE_TABLES`,
and the admin failing to load under `astro dev` because Vite pre-bundled core's
source without its `@/` resolver.

## The shape

A script that builds and packs the published packages, installs them into a
scratch site with the command in `apps/docs/installation.md`, and runs what a
new user runs: `db:generate`, `db:init`, `astro dev` with first-run setup in
headless chromium, then `astro build` and the built server. The browser steps
can reuse `scripts/check-boot.mjs`.

## Decisions

- **A CI job of its own, not a stage of `pnpm run verify`,** because it needs
  the npm registry. It runs on every push and pull request, and weekly, so an
  upstream release that breaks the guide's unpinned install shows while nothing
  is being pushed.
- **Under npm and pnpm both**, as a matrix. pnpm hoists nothing, which is where
  the nested `optimizeDeps` entries matter most. pnpm 11 also refuses an
  install until someone approves `esbuild`'s build script, which `astro` and
  `vite` bring, so the pnpm site approves it as `pnpm approve-builds` would. The
  guide covers npm only, so a pnpm user meets that refusal with no help from it.
- **The guide is the fixture.** The files, the install command and the CLI
  commands come from the page's own code blocks. `DECISIONS.md` records why.
- **The browser flow is shared with `check:boot`**, in
  `scripts/admin-browser-check.mjs`, with the helpers both use in
  `scripts/check-helpers.mjs`.

## The work

- [x] Write the script, with the scratch site under the OS temp directory:
      `scripts/check-install.mjs`, run as `pnpm run check:install`.
- [x] Add the CI job and a row to the command table in `AGENTS.md`.
