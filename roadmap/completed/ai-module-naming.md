# AI module naming and file split

`DECISIONS.md` ruled that
a capability slot's accessor must name the thing it holds. It fixed `email` and
`media.image` and left `ai` behind as an explicit "noted exception, not a fix",
so `getAiConfig` was the last accessor in core still calling its contents a
config while holding wrapped model instances.

Second problem in the same module: `buildAiConfig` is the boot-time assembly of
the whole subsystem — it owns the dynamic `import('ai')`, wraps every configured
model and produces the registry payload — but it lived in `ai/middleware.ts`,
named after one of the steps it performs.

## What stays

`AiConfig` in `packages/astromech/src/types/ai.ts` keeps its name. It is the
`ai:` block an author writes, and holding a constructed model instance is
ordinary for config in this ecosystem (`storage: r2()`, `db: libsql()`).

`getModel` and `hasModel` keep theirs. They are the public surface fixed by
`DECISIONS.md`, and nothing outside the package
changes.

The two fields inside the registry payload stay `model` and `models`, so it goes
on mirroring the shape of the `AiConfig` it was built from.

## The work

One branch, one commit.

- [x] `packages/astromech/src/ai/registry.ts` — `WrappedAiConfig` → `AiModels`,
      `setAiConfig` → `setAiModels`, `getAiConfig` → `getAiModels`. The
      `createRegistry` key stays the string `'ai'`; it is a `globalThis` key and
      changing it would orphan anything already registered.
- [x] New `packages/astromech/src/ai/models.ts` — `buildAiConfig` moves here as
      `buildAiModels`, taking the dynamic `import('ai')` and the wrapping loop
      with it.
- [x] `packages/astromech/src/ai/middleware.ts` — reduced to `logging()` and its
      `log()` helper. Every import is now type-only and it no longer imports the
      registry, so the module's internal graph loses an edge.
- [x] `packages/astromech/src/ai/index.ts` and
      `packages/astromech/src/astromech.ts` — updated to the new names.
- [x] `packages/astromech/tests/ai/model-access.test.ts` — updated to the new
      names, no assertion changed.
- [x] Write `DECISIONS.md`, recording why the
      registry probe stays a bare `get` against 0088's `get*` throws rule, and
      why `AiConfig` did not move.
- [x] Add the `0090` line to `DECISIONS.md`.

## Not done here

Reconciling `DECISIONS.md` (registry probes are
nullable `get`) with `DECISIONS.md`
(`get*` throws, `resolve*` is the nullable one) across all six registry probes
and the public `getModel`. 0090 records the tension and picks consistency with
the five siblings for this one module; the sweep is a separate decision.
