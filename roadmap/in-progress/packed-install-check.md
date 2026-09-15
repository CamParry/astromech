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

## Open questions

- It needs the npm registry, so it cannot run offline like the rest of the
  gate. A CI job of its own, on a schedule or before a release, rather than a
  stage in `pnpm run verify`.
- Whether it also runs under pnpm, which hoists nothing, and that is where the
  nested `optimizeDeps` entries matter most.

## The work

- [ ] Write the script, with the scratch site under the OS temp directory.
- [ ] Add the CI job and a row to the command table in `AGENTS.md`.
