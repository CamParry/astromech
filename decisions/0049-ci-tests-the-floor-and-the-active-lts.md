# 0049 — CI tests the floor and the Active LTS

**Date:** 2026-08-15
**Status:** accepted

The Test and Boot jobs run on Node 22 and 24. Lint, Type Check and Build run
on 24 only. `engines.node` stays `>=22.13.0`, as set by
`decisions/0048-the-supported-node-floor-is-22-13.md`.

## Why two versions

22 is the floor a consumer may install on. 24 has been the Active LTS since
October 2025 and is what most of them will actually run. Testing one leaves the
other a claim nobody checks, which is the argument 0048 already made about
Node 20.

The two are not interchangeable for long: 22 entered maintenance in October
2025 and reaches end of life in April 2027, at which point the floor should
move to 24 and this matrix collapses back to one version.

## Why only two jobs

Lint, Type Check and Build run eslint, tsc and tsup. Their output does not
depend on which of 22 or 24 executes them, so matrixing them would double the
job count and verify nothing. Test and Boot execute the runtime, which is where
a version difference can actually show.

`fail-fast` is off. Cancelling the sibling job on the first failure would hide
whether a break is version-specific, and that is the only question the matrix
exists to answer.

## Node 20 is not an option

pnpm 11 requires at least v22.13, and `cache: pnpm` makes `setup-node` run
`pnpm store path`, so a Node 20 job fails at that step before installing
anything. Node 20 reached end of life on 2026-04-30 regardless.

This is what 0048 recorded as "add a Node 20 runtime job", rejected there and
still unavailable: it would need the install and the test run split across two
Node versions in one job. The matrix here is a different thing, covering two
versions pnpm supports.
