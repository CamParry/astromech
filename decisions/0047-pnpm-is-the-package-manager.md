# 0047 — pnpm is the package manager

**Date:** 2026-08-15
**Status:** accepted

The repo used npm workspaces. It now uses pnpm, pinned by `packageManager` in
the root `package.json`, with the workspace globs and hoist list in
`pnpm-workspace.yaml`. `package-lock.json` is replaced by `pnpm-lock.yaml`.

## Why

npm installs a flat `node_modules`, so any package can import anything any
other package depends on. Nothing fails, and the dependency stays undeclared.
The migration found roughly thirty of these: six plugin packages imported
`typescript` and `tsup` without declaring either, the assistant imported
`vitest` and `kysely`, `apps/demo` imported `react`, `react-dom`, `kysely`,
`better-auth` and `sharp`. Every one of them worked by accident of hoisting.

pnpm's layout makes a package see only what it declares, so those became
install-time or build-time errors and were fixed by declaring them. That is
the whole reason for the change. Speed and disk use are real but were not the
argument.

Internal dependencies moved to `workspace:*`. Plugin `peerDependencies` on
`astromech` stay at `"*"`, because that range is what a consumer resolves
against and it is not a workspace link.

## Publishing is unaffected

Changesets rewrites `workspace:*` to the concrete published version at publish
time, so what lands on npm carries ordinary semver ranges. A consumer of
`astromech` sees no difference, and nothing about their own package manager
changes — `apps/docs` still tells readers to install with npm, because their
site is theirs.

## The hoist list is deliberate, not a workaround

`publicHoistPattern` in `pnpm-workspace.yaml` puts a named set back at the root
where any package can see it. This is not pnpm being worked around; it is a
requirement of how the admin ships.

The admin ships as source so the host app's Vite compiles it and the admin
shares the host's React instance rather than bundling a second one
(`decisions/0033-the-repo-resolves-src-and-npm-gets-dist.md`). Vite therefore
has to resolve the admin's client dependencies from the app root, which is what
`optimizeDeps.include` in `packages/astromech/src/boot/astro.ts` asks for. The
two lists must stay in step; a package in one and not the other is a bug.

`libsql` and `@libsql/*` are on the list for a different reason, and it is the
one worth remembering. Vite externalises a server dependency only if it can
resolve it from the app root. `libsql` reaches `apps/demo` transitively through
`@libsql/client`, so under npm's flat tree it resolved and stayed external.
Under pnpm it did not resolve, so Vite inlined it — and libsql loads its native
binding with a dynamic `require('@libsql/darwin-arm64')`, which Rollup can only
replace with a stub that throws.

Nothing about that is visible at build time. The build succeeds and the server
starts; the first render throws.

## What that exposed in check:boot

`scripts/check-boot.mjs` could not report the failure. The node adapter answers
an unhandled rejection during render by logging it and leaving the socket open,
and `fetch` has no default timeout, so `waitForServer` blocked forever on a
request that never settled. Its 60-attempt bound never applied, because an
attempt is only counted once the request finishes. The captured server output,
which named the cause on its second line, is only printed on a failure the
check never reached.

So the one check that exists to catch a boot defect turned a boot defect into a
hang. Every request now carries a deadline, and the timeout message
distinguishes "nothing ever listened" from "something listened and would not
answer" — different causes, previously the same symptom. This was a
pre-existing defect that the migration happened to trigger.

## Rejected alternatives

**Stay on npm.** The undeclared dependencies stay invisible until a package is
published and a consumer installs it without the accidental hoist, which is the
worst place to find out. The repo publishes seven packages, so this is a real
risk rather than a tidiness argument.

**Yarn or Bun.** Both solve the workspace part. Neither was worth evaluating
seriously once the goal was narrowed to strict dependency isolation, which pnpm
does by default and which is the reason for changing at all.

## Other settings, and why each exists

`allowBuilds` lists `esbuild`, `sharp` and `workerd`. pnpm blocks postinstall
scripts by default; all three ship platform binaries that do not work without
theirs, and `workerd` backs the D1 local-emulation test.

`confirmModulesPurge: false` stops pnpm prompting before it removes
`node_modules` when the layout changes. `check-boot.mjs` spawns its children
with `stdio: 'inherit'`, so that prompt reads a stdin with no terminal attached
and hangs. The script also sets `CI` for its children, which says the same
thing to anything else that might ask a question.
