# 0048 — The supported Node floor is 22.13

**Date:** 2026-08-15
**Status:** accepted

`engines.node` in `packages/astromech` and `packages/schema-engine` moves from
`>=20.0.0` to `>=22.13.0`, and CI runs on Node 22 rather than 20.

## Why

pnpm 11 requires at least Node v22.13, so the migration in
`decisions/0047-pnpm-is-the-package-manager.md` made Node 20 unusable for
developing this repo. It is not a soft requirement: `cache: pnpm` makes
`actions/setup-node` run `pnpm store path`, so CI on Node 20 failed at that
step before installing anything, with `No such built-in module: node:sqlite`.

Pinning CI to 22 fixes that, but it also means nothing exercises Node 20 any
more. `engines.node >=20.0.0` would then be a promise no check backs. A
declared range that is never tested is worse than a narrower one that is,
because it fails at a consumer's install rather than in our own CI.

## Rejected alternatives

**Leave `engines` at `>=20.0.0` and accept the gap.** Cheapest, and it keeps
the wider consumer range on paper. Rejected because the range would be a claim
nobody verifies, and the place it would surface is someone else's install.

**Install and build on 22, then run the test suite under Node 20.** This keeps
the promise honest and is the option that preserves the wider range. Rejected
as more workflow than the current stage justifies: nothing is published yet, so
there is no consumer on Node 20 to protect, and the job can be added if one
appears. Reconsider this before the first release if the wider range matters.

## Scope

The plugin packages declare no `engines` at all, before or after. They peer
depend on `astromech`, so its floor reaches them, and adding six duplicate
declarations would be six more places to keep in step.
