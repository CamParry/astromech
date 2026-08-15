# 0050 — Every published package states and enforces the Node floor

**Date:** 2026-08-15
**Status:** accepted

The floor set by `decisions/0048-the-supported-node-floor-is-22-13.md` was
declared in two of the eight published packages and checked nowhere. It is now
declared in all eight, pinned in the types, and enforced by the build.

- `engines.node: ">=22.13.0"` on all eight published packages, and on the
  private root so a contributor on the wrong Node hears about it at install.
- `@types/node` moves from `^25.x` to `^22.20.1` everywhere.
- `target: "node22"` on all nine tsup build configs.
- `.nvmrc` names 24.

## Why the plugins needed their own `engines`

0048 said the plugins inherit the floor because they peer depend on
`astromech`. That is true of the resolved tree and false of the thing a person
reads. `@astromech/seo` is published separately and can be installed on its
own, and a package manager reports `engines` per package. A floor that only
one package states is one the other seven do not.

## Why `@types/node` had to come down

`^25.x` types the whole Node 25 API against a floor of 22. Code calling
something that only exists in 24 or 25 would type-check clean, build clean, and
throw at runtime on the version we promise to support — the same
untested-claim failure 0048 was written about, in a form no test can catch,
because the types are what makes it invisible.

Node 25 is also an odd-numbered line that reached end of life in June 2026, so
the dependency was pinned to a dead release regardless.

Typecheck passes unchanged after the move, so nothing had come to depend on a
newer API. This is a guard against that happening, not a repair.

## Why the build carries a target

tsup sets no `target`, so esbuild defaults to `esnext` and emits whatever
syntax the source uses. Nothing downlevels to the floor, and nothing complains.
`node22` makes the declared floor the thing the build actually produces.

This is a tightening, never a loosening: `esnext` is newer than `node22`, so
any output valid before stays valid. The admin is unaffected either way, since
it ships as source and the host app's Vite compiles it to that app's targets
(`decisions/0033-the-repo-resolves-src-and-npm-gets-dist.md`).

## Why `.nvmrc` says 24, not 22

24 is the Active LTS and what CI runs for Lint, Type Check and Build, so a
contributor's local Node matches the common path. Developing above the floor is
safe here because two things catch a newer API before it ships: `@types/node`
at `^22` fails the typecheck, and the Node 22 leg of the Test and Boot matrix
fails at runtime (`decisions/0049-ci-tests-the-floor-and-the-active-lts.md`).

Pinning 22 instead would make the floor the daily experience at the cost of
never exercising the version most consumers run. The guards make that trade
unnecessary.

## When this changes

Node 22 reaches end of life in April 2027. At that point all five of these move
together to 24, and the matrix in 0049 collapses to one version. They are
listed here so that is one edit rather than a hunt.
